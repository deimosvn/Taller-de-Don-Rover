// Instalador del firmware de Don Rover desde el navegador (Chrome o Edge, por USB), con la
// herramienta oficial de Espressif (esptool-js). Hay una imagen por placa, ya unida
// (bootloader, particiones y app), que se escribe en la dirección 0x0. Las publica `pio run`
// en public/firmware/ con el manifiesto donrover.json (ver firmware/donrover-knomi/merge_bin.py).

import { rover } from './link';

/** Una imagen del firmware para un modelo de placa. */
export interface FirmwareBuild {
  id: string;
  name: string;
  chip: 'ESP32' | 'ESP32-C3' | 'ESP32-S3' | string;
  version: string;
  file: string;
  address: number;
  size: number;
  sha256: string;
  built: string;
}

export interface FirmwareManifest {
  name: string;
  version: string;
  builds: FirmwareBuild[];
}

const fetchJson = async <T,>(path: string): Promise<T | null> => {
  try {
    const res = await fetch(new URL(path, document.baseURI).toString(), { cache: 'no-store' });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
};

export async function firmwareManifest(): Promise<FirmwareManifest | null> {
  const all = await fetchJson<FirmwareManifest>('firmware/donrover.json');
  if (all && Array.isArray(all.builds) && all.builds.length) return all;
  // Despliegues anteriores: solo la imagen de la KNOMI.
  const knomi = await fetchJson<Omit<FirmwareBuild, 'id' | 'chip'>>('firmware/donrover-knomi.json');
  return knomi ? { name: 'Don Rover', version: knomi.version, builds: [{ ...knomi, id: 'knomi', chip: 'ESP32', name: 'BIGTREETECH KNOMI v1' }] } : null;
}

/** ¿El chip que contestó (descripción de esptool) es el de esta imagen? */
export function chipMatches(description: string, chip: string): boolean {
  const d = description.toUpperCase();
  if (chip === 'ESP32-C3') return d.startsWith('ESP32-C3');
  if (chip === 'ESP32-S3') return d.startsWith('ESP32-S3');
  // ESP32 clásico: "ESP32-D0WD-V3", "ESP32-PICO-D4"… (no C2/C3/C6, S2/S3, H2 ni P4).
  if (chip === 'ESP32') return /^ESP32(?!-(C\d|S[23]|H\d|P\d))/.test(d);
  return d.startsWith(chip.toUpperCase());
}

export interface FlashProgress {
  stage: 'port' | 'download' | 'connect' | 'erase' | 'write' | 'reset' | 'done' | 'error';
  /** 0–1 mientras escribe. */
  progress: number;
  text: string;
  /** La placa no entró sola al modo de carga: conviene reintentar en modo manual (BOOT). */
  manual?: boolean;
}

export interface FlashOptions {
  /** Modo manual: el usuario mantiene BOOT al conectar el cable (sin reinicio automático). */
  manual?: boolean;
  /** Imagen de la placa elegida (por omisión, la KNOMI). */
  build?: FirmwareBuild | null;
}

/** Instala el firmware: pide el puerto, descarga la imagen, la escribe y reinicia la placa. */
export async function flashFirmware(onProgress: (p: FlashProgress) => void, log: (line: string) => void = () => {}, opts: FlashOptions = {}): Promise<boolean> {
  const serial = (navigator as unknown as { serial?: { requestPort(o: unknown): Promise<SerialPort> } }).serial;
  if (!serial) {
    onProgress({ stage: 'error', progress: 0, text: 'Este navegador no puede usar USB. Abre la plataforma en Chrome o Edge en una computadora.' });
    return false;
  }
  // El enlace de Don Rover suelta el puerto mientras se instala.
  rover.busy = true;
  await rover.releaseUsb();
  let transport: import('esptool-js').Transport | null = null;
  try {
    onProgress({
      stage: 'port',
      progress: 0,
      text: opts.manual
        ? 'Mantén presionado el botón BOOT de la placa, desconecta y vuelve a conectar el cable, suelta el botón y elige el puerto.'
        : 'Elige el puerto de Don Rover (suele llamarse USB Serial, CH340 o CP210x).',
    });
    // Sin filtro: algunas placas usan chips USB que no están en la lista.
    const port = await serial.requestPort({});

    onProgress({ stage: 'download', progress: 0, text: 'Descargando el firmware…' });
    const build = opts.build ?? (await firmwareManifest())?.builds[0] ?? null;
    const res = await fetch(new URL(`firmware/${build?.file ?? 'donrover-knomi.bin'}`, document.baseURI).toString(), { cache: 'no-store' });
    if (!res.ok) throw new Error('No se encontró el archivo del firmware en la plataforma.');
    const bytes = new Uint8Array(await res.arrayBuffer());
    // esptool-js recibe la imagen como texto binario (un carácter por byte).
    let data = '';
    for (let i = 0; i < bytes.length; i += 0x8000) data += String.fromCharCode(...bytes.subarray(i, i + 0x8000));

    onProgress({ stage: 'connect', progress: 0, text: opts.manual ? 'Conectando en modo manual…' : 'Entrando al modo de carga de la placa…' });
    const { ESPLoader, Transport } = await import('esptool-js');
    transport = new Transport(port, false);
    const loader = new ESPLoader({
      transport,
      // 230400 es estable con los chips USB-serie baratos (CH340) y tarda menos de un minuto.
      baudrate: 230400,
      romBaudrate: 115200,
      terminal: { clean() {}, writeLine: (s: string) => log(s), write: (s: string) => log(s) },
    });
    const chip = await loader.main(opts.manual ? 'no_reset' : 'default_reset');
    log(`Chip detectado: ${chip}`);
    const want = build?.chip ?? 'ESP32';
    if (!chipMatches(chip, want)) {
      throw new Error(`La placa conectada tiene un ${chip}, pero elegiste ${build?.name ?? 'KNOMI v1'} (${want}). Elige el modelo correcto arriba.`);
    }

    onProgress({ stage: 'write', progress: 0, text: 'Instalando el firmware (no desconectes el cable)…' });
    await loader.writeFlash({
      fileArray: [{ data, address: build?.address ?? 0 }],
      flashSize: 'keep',
      flashMode: 'keep',
      flashFreq: 'keep',
      eraseAll: false,
      compress: true,
      reportProgress: (_i, written, total) => onProgress({ stage: 'write', progress: written / total, text: `Instalando… ${Math.round((written / total) * 100)} %` }),
    });

    onProgress({ stage: 'reset', progress: 1, text: 'Reiniciando a Don Rover…' });
    await loader.after('hard_reset');
    await transport.disconnect();
    transport = null;
    onProgress({ stage: 'done', progress: 1, text: `¡Listo! Don Rover ${build?.version ?? ''} quedó instalado en tu ${build?.name ?? 'placa'}.`.replace('  ', ' ') });
    return true;
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    log(`Error: ${msg}`);
    const boot = /Failed to connect|Timed out|timeout|wrong boot mode|Invalid head|No serial data/i.test(msg);
    onProgress({
      stage: 'error',
      progress: 0,
      manual: boot && !opts.manual,
      text: /No port selected|cancel|NotFoundError/i.test(msg)
        ? 'No se eligió ningún puerto. Si la placa no aparece en la lista, revisa que el cable sea de datos (no solo de carga) y que esté instalado el controlador USB de la placa (CH340 o CP210x).'
        : /open|busy|NetworkError|InvalidStateError/i.test(msg)
          ? 'El puerto está ocupado. Cierra las otras pestañas de la plataforma (la consola del profe se conecta sola a la placa) y programas como Arduino IDE, Cura o el monitor serie, y vuelve a intentar.'
          : boot
            ? opts.manual
              ? 'La placa sigue sin entrar al modo de carga. Prueba otro cable o puerto USB, o instala desde la terminal con firmware/donrover-knomi/flash.ps1.'
              : 'La placa no entró sola al modo de carga. Usa «Reintentar en modo manual»: mantén presionado BOOT mientras conectas el cable.'
            : `No se pudo instalar: ${msg}`,
    });
    try {
      await transport?.disconnect();
    } catch {
      /* nada */
    }
    return false;
  } finally {
    rover.busy = false;
  }
}
