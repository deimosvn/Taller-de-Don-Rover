// Enlace con Don Rover físico (placa BIGTREETECH KNOMI con pantalla redonda).
//
// La plataforma habla por las bocinas y escucha con el micrófono de la computadora del profe;
// la placa solo muestra la cara de Don Rover y mueve la boca. Tres caminos, el mismo protocolo
// (una línea JSON por mensaje, ver firmware/donrover-knomi/src/main.cpp):
//
//   · USB (Web Serial, Chrome o Edge): lo más confiable y con la boca más sincronizada.
//   · Wi-Fi local: ws://<ip>:81 en la misma red. Una página HTTPS no siempre puede abrirlo;
//     entonces se prueba POST http://<ip>/cmd (Chrome pide permiso de "red local").
//   · Nube: canal de Supabase Realtime "donrover-bot-<ID>", al que la placa también se une.
//     Funciona desde la plataforma publicada en cualquier red con internet.
//
// Un solo enlace por pestaña (singleton): la consola, la página de configuración y el
// entrenador comparten la misma placa.

import type { RealtimeChannel, RealtimeClient } from '@supabase/realtime-js';
import { relayConfig } from '../net/relay';

export type RoverExpr = 'neutral' | 'happy' | 'sad' | 'alert' | 'think' | 'wow' | 'sleep' | 'listen' | 'star';

export type RoverCmd =
  | { t: 'hello' }
  | { t: 'ping' }
  | { t: 'face'; e: RoverExpr; ms?: number }
  | { t: 'talk'; on: 0 | 1 }
  | { t: 'm'; v: number }
  | { t: 'look'; x: number; y: number }
  | { t: 'ring'; p: number; c?: string }
  | { t: 'pulse'; c: string }
  | { t: 'card'; title: string; sub?: string; ms?: number }
  | { t: 'bl'; v: number }
  | { t: 'invert'; on: 0 | 1 }
  | { t: 'wifi'; ssid: string; pass: string }
  | { t: 'forget' }
  | { t: 'app'; url: string }
  | { t: 'reboot' };

export interface RoverInfo {
  fw: string;
  id: string;
  /** Modelo de placa (knomi, esp32c3-round, esp32-devkit…). */
  board: string;
  /** Inversión de color de la pantalla. */
  inv: boolean;
  wifi: 'ok' | 'connecting' | 'portal' | 'off';
  ssid: string;
  ip: string;
  cloud: 'on' | 'connecting' | 'nocfg' | 'off';
  ap: string;
  app: string;
}

export type RoverEvent = { t: 'btn'; k: 'short' | 'long' } | { t: 'hi' } | { t: 'bye' };

export type Transport = 'usb' | 'lan' | 'http' | 'cloud';
export type LinkState = 'off' | 'connecting' | 'on';

export interface RoverStatus {
  state: LinkState;
  via: Transport | null;
  info: RoverInfo | null;
  /** Texto para la interfaz (qué está pasando o por qué falló). */
  detail: string;
}

const STORE = 'donrover.placa';

interface Saved {
  id?: string;
  ip?: string;
  /** Último camino que funcionó (para reconectar solo al volver a abrir la consola). */
  via?: Transport;
}

function loadSaved(): Saved {
  try {
    return JSON.parse(localStorage.getItem(STORE) || '{}') as Saved;
  } catch {
    return {};
  }
}

function save(patch: Saved): void {
  try {
    localStorage.setItem(STORE, JSON.stringify({ ...loadSaved(), ...patch }));
  } catch {
    /* almacenamiento no disponible */
  }
}

/* ---------------- Web Serial (tipos mínimos: no vienen en lib.dom) ---------------- */

interface SerialPortLike {
  open(o: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  setSignals(s: { dataTerminalReady?: boolean; requestToSend?: boolean }): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  getInfo(): { usbVendorId?: number; usbProductId?: number };
}
interface SerialLike {
  requestPort(o?: { filters?: { usbVendorId: number }[] }): Promise<SerialPortLike>;
  getPorts(): Promise<SerialPortLike[]>;
}
const serialApi = (): SerialLike | null => (typeof navigator !== 'undefined' && 'serial' in navigator ? (navigator as unknown as { serial: SerialLike }).serial : null);

export const usbSupported = () => serialApi() !== null;

/** Chips USB-serie comunes en placas ESP32 (CH340, CP210x, FTDI, Espressif). */
export const USB_FILTERS = [{ usbVendorId: 0x1a86 }, { usbVendorId: 0x10c4 }, { usbVendorId: 0x0403 }, { usbVendorId: 0x303a }];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---------------- enlace ---------------- */

type Listener<T> = (v: T) => void;

class RoverLink {
  status: RoverStatus = { state: 'off', via: null, info: null, detail: 'Don Rover no está conectado.' };
  private statusL = new Set<Listener<RoverStatus>>();
  private eventL = new Set<Listener<RoverEvent>>();

  private port: SerialPortLike | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private ws: WebSocket | null = null;
  private httpBase: string | null = null;
  private client: RealtimeClient | null = null;
  private channel: RealtimeChannel | null = null;
  private ping: ReturnType<typeof setInterval> | null = null;
  private lastSeen = 0;
  private lastMouth = 0;
  private gen = 0;
  /** El puerto USB lo está usando el instalador de firmware. */
  busy = false;

  onStatus(fn: Listener<RoverStatus>): () => void {
    this.statusL.add(fn);
    fn(this.status);
    return () => this.statusL.delete(fn);
  }

  onEvent(fn: Listener<RoverEvent>): () => void {
    this.eventL.add(fn);
    return () => this.eventL.delete(fn);
  }

  get connected(): boolean {
    return this.status.state === 'on';
  }

  /** (Método y no propiedad: TypeScript no debe "recordar" el estado entre esperas.) */
  private isOn(): boolean {
    return this.status.state === 'on';
  }

  get saved(): Saved {
    return loadSaved();
  }

  private set(patch: Partial<RoverStatus>): void {
    this.status = { ...this.status, ...patch };
    for (const fn of this.statusL) fn(this.status);
  }

  /* ---------- mensajes de la placa ---------- */

  private receive(raw: string): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return; // mensajes de arranque del ESP32 u otro texto
    }
    if (!msg || typeof msg.t !== 'string') return;
    this.lastSeen = Date.now();
    if (msg.t === 'hi') {
      const info: RoverInfo = {
        fw: String(msg.fw ?? ''),
        id: String(msg.id ?? '').slice(0, 8),
        board: String(msg.board ?? 'knomi').slice(0, 24),
        inv: msg.inv === undefined ? true : Boolean(msg.inv),
        wifi: (['ok', 'connecting', 'portal', 'off'].includes(String(msg.wifi)) ? msg.wifi : 'off') as RoverInfo['wifi'],
        ssid: String(msg.ssid ?? '').slice(0, 40),
        ip: String(msg.ip ?? '').slice(0, 40),
        cloud: (['on', 'connecting', 'nocfg', 'off'].includes(String(msg.cloud)) ? msg.cloud : 'off') as RoverInfo['cloud'],
        ap: String(msg.ap ?? '').slice(0, 40),
        app: String(msg.app ?? '').slice(0, 200),
      };
      const via = this.status.via;
      save({ id: info.id || undefined, ip: info.wifi === 'ok' ? info.ip : loadSaved().ip, via: via ?? undefined });
      this.set({ state: 'on', info, detail: `Don Rover conectado por ${LABEL[via ?? 'usb']}.` });
      // La placa aprende la dirección de la plataforma (para su canal en la nube).
      if (via === 'usb' && location.protocol === 'https:' && info.app !== location.origin) this.send({ t: 'app', url: location.origin });
      this.emit({ t: 'hi' });
    } else if (msg.t === 'btn' && (msg.k === 'short' || msg.k === 'long')) {
      this.emit({ t: 'btn', k: msg.k });
    } else if (msg.t === 'bye') {
      this.emit({ t: 'bye' });
    }
  }

  private emit(e: RoverEvent): void {
    for (const fn of this.eventL) fn(e);
  }

  /* ---------- envío ---------- */

  send(cmd: RoverCmd): void {
    const line = JSON.stringify(cmd);
    if (this.writer) {
      void this.writer.write(new TextEncoder().encode(line + '\n')).catch(() => this.lost('Se desconectó el cable USB.'));
    } else if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(line);
    } else if (this.httpBase) {
      // Sin WebSocket (página HTTPS): POST por cada orden, sin las de la boca que van muy rápido.
      if (cmd.t !== 'm') void this.post(line);
    } else if (this.channel) {
      void this.channel.send({ type: 'broadcast', event: 'c', payload: cmd });
    }
  }

  /** Nivel de la boca (0–1): se limita la frecuencia según el camino (la nube es más lenta). */
  mouth(level: number): void {
    const now = performance.now();
    const gap = this.status.via === 'cloud' ? 140 : this.status.via === 'http' ? 1e9 : 45;
    if (now - this.lastMouth < gap) return;
    this.lastMouth = now;
    this.send({ t: 'm', v: Math.round(Math.max(0, Math.min(1, level)) * 100) });
  }

  private async post(line: string): Promise<Record<string, unknown> | null> {
    if (!this.httpBase) return null;
    try {
      const res = await fetch(`${this.httpBase}/cmd`, {
        method: 'POST',
        body: line,
        headers: { 'content-type': 'text/plain' },
        // Chrome: permiso de "red local" para que una página HTTPS hable con la placa.
        ...({ targetAddressSpace: 'local' } as RequestInit),
      });
      const st = (await res.json()) as Record<string, unknown>;
      this.lastSeen = Date.now();
      return st;
    } catch {
      return null;
    }
  }

  /* ---------- conexión ---------- */

  /** Cierra cualquier camino abierto. */
  async disconnect(detail = 'Don Rover no está conectado.'): Promise<void> {
    this.gen++;
    if (this.ping) clearInterval(this.ping);
    this.ping = null;
    try {
      this.send({ t: 'talk', on: 0 });
      this.send({ t: 'ring', p: -1 });
    } catch {
      /* nada */
    }
    const reader = this.reader;
    const writer = this.writer;
    const port = this.port;
    this.reader = null;
    this.writer = null;
    this.port = null;
    try {
      await reader?.cancel();
    } catch {
      /* nada */
    }
    try {
      reader?.releaseLock();
      await writer?.close();
    } catch {
      /* nada */
    }
    try {
      await port?.close();
    } catch {
      /* nada */
    }
    this.ws?.close();
    this.ws = null;
    this.httpBase = null;
    void this.channel?.unsubscribe();
    this.client?.disconnect();
    this.channel = null;
    this.client = null;
    this.set({ state: 'off', via: null, detail });
  }

  private lost(detail: string): void {
    if (this.status.state === 'off') return;
    void this.disconnect(detail);
  }

  /** Latido: la placa sabe que la plataforma sigue ahí; si la placa no contesta, se marca caída. */
  private startPing(gen: number): void {
    if (this.ping) clearInterval(this.ping);
    this.lastSeen = Date.now();
    this.ping = setInterval(() => {
      if (gen !== this.gen) return;
      this.send({ t: 'ping' });
      // Cada tanto se pide el estado (así se nota si la placa se apagó).
      if (Date.now() - this.lastSeen > 9000) this.send({ t: 'hello' });
      if (Date.now() - this.lastSeen > 20000 && this.status.via !== 'usb') this.lost('Don Rover dejó de responder.');
    }, 4000);
  }

  /** USB: abre el puerto, reinicia la placa (para que arranque limpia) y espera su saludo. */
  async connectUsb(opts: { ask?: boolean } = {}): Promise<boolean> {
    const api = serialApi();
    if (!api) {
      this.set({ state: 'off', detail: 'Este navegador no puede usar USB: abre la plataforma en Chrome o Edge en una computadora.' });
      return false;
    }
    if (this.busy) return false;
    await this.disconnect();
    const gen = this.gen;
    this.set({ state: 'connecting', via: 'usb', detail: 'Buscando a Don Rover por USB…' });
    let port: SerialPortLike;
    try {
      const known = await api.getPorts();
      port = !opts.ask && known.length ? known[0] : await api.requestPort({});
    } catch {
      this.set({ state: 'off', via: null, detail: 'No se eligió ningún puerto USB.' });
      return false;
    }
    try {
      await port.open({ baudRate: 115200 });
    } catch (err) {
      this.set({ state: 'off', via: null, detail: `No se pudo abrir el puerto (¿otro programa lo usa?): ${(err as Error).message}` });
      return false;
    }
    if (gen !== this.gen) return false;
    this.port = port;
    // Reinicio suave (RTS) sin entrar al modo de carga (DTR suelto): igual que esptool.
    try {
      await port.setSignals({ dataTerminalReady: false, requestToSend: true });
      await sleep(120);
      await port.setSignals({ dataTerminalReady: false, requestToSend: false });
    } catch {
      /* algunos adaptadores no lo permiten: no pasa nada */
    }
    this.writer = port.writable!.getWriter();
    void this.readLoop(port, gen);
    save({ via: 'usb' });
    // Espera el saludo (la placa lo manda al arrancar) y si no llega, lo pide.
    for (let i = 0; i < 12 && gen === this.gen && !this.isOn(); i++) {
      await sleep(i < 4 ? 400 : 700);
      if (!this.isOn()) this.send({ t: 'hello' });
    }
    if (gen !== this.gen) return false;
    if (!this.isOn()) {
      this.set({ detail: 'El puerto está abierto pero Don Rover no responde. ¿Ya tiene instalado el firmware? Instálalo desde «Don Rover físico».' });
      return false;
    }
    this.startPing(gen);
    return true;
  }

  private async readLoop(port: SerialPortLike, gen: number): Promise<void> {
    const decoder = new TextDecoder();
    let buf = '';
    while (port.readable && gen === this.gen) {
      const reader = port.readable.getReader();
      this.reader = reader;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (line.startsWith('{')) this.receive(line);
          }
          if (buf.length > 4096) buf = '';
        }
      } catch {
        break;
      } finally {
        try {
          reader.releaseLock();
        } catch {
          /* nada */
        }
      }
    }
    if (gen === this.gen) this.lost('Se desconectó el cable USB de Don Rover.');
  }

  /**
   * Wi-Fi: `target` es la IP (o donrover.local) en la misma red, o el código de 6 caracteres de
   * la placa para usar el canal en la nube.
   */
  async connectWifi(target: string): Promise<boolean> {
    const t = target.trim();
    if (!t) return false;
    if (/^[0-9A-Fa-f]{6}$/.test(t)) return this.connectCloud(t.toUpperCase());
    await this.disconnect();
    const gen = this.gen;
    const host = t.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    this.set({ state: 'connecting', via: 'lan', detail: `Buscando a Don Rover en ${host}…` });
    const ok = await new Promise<boolean>((resolve) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(`ws://${host}:81/`);
      } catch {
        resolve(false); // una página HTTPS no puede abrir ws:// (contenido mixto)
        return;
      }
      const timer = setTimeout(() => {
        ws.close();
        resolve(false);
      }, 5000);
      ws.onopen = () => {
        clearTimeout(timer);
        this.ws = ws;
        resolve(true);
      };
      ws.onerror = () => {
        clearTimeout(timer);
        resolve(false);
      };
      ws.onmessage = (e) => typeof e.data === 'string' && this.receive(e.data);
      ws.onclose = () => {
        if (this.ws === ws && gen === this.gen) this.lost('Se perdió la conexión Wi-Fi con Don Rover.');
      };
    });
    if (gen !== this.gen) return false;
    if (ok) {
      save({ ip: host, via: 'lan' });
      this.send({ t: 'hello' });
      this.startPing(gen);
      return true;
    }
    // Sin WebSocket: órdenes por HTTP (Chrome pide permiso de red local en páginas HTTPS).
    this.httpBase = `http://${host}`;
    this.set({ via: 'http', detail: 'Probando la conexión directa por la red local…' });
    const st = await this.post(JSON.stringify({ t: 'hello' }));
    if (gen !== this.gen) return false;
    if (st && typeof st.id === 'string') {
      this.status.via = 'http';
      this.receive(JSON.stringify({ ...st, t: 'hi' }));
      save({ ip: host, id: st.id, via: 'http' });
      this.startPing(gen);
      return true;
    }
    this.httpBase = null;
    const id = loadSaved().id;
    if (id) return this.connectCloud(id);
    this.set({
      state: 'off',
      via: null,
      detail: 'El navegador no deja que esta página (HTTPS) hable directo con la placa. Escribe el código de 6 letras de Don Rover para conectarte por la nube, o conéctalo por USB.',
    });
    return false;
  }

  /** Nube: el mismo canal de Supabase Realtime al que se une la placa. */
  async connectCloud(id: string): Promise<boolean> {
    await this.disconnect();
    const gen = this.gen;
    this.set({ state: 'connecting', via: 'cloud', detail: `Buscando a Don Rover ${id} por la nube…` });
    const cfg = await relayConfig();
    if (gen !== this.gen) return false;
    if (!cfg) {
      this.set({ state: 'off', via: null, detail: 'La plataforma no tiene configurado el canal en la nube (Supabase). Usa USB o la red local.' });
      return false;
    }
    try {
      const { RealtimeClient } = await import('@supabase/realtime-js');
      const client = new RealtimeClient(`${cfg.url.replace(/^http/, 'ws')}/realtime/v1`, { params: { apikey: cfg.key }, heartbeatIntervalMs: 15000 });
      client.connect();
      const ch = client.channel(`donrover-bot-${id}`, { config: { broadcast: { self: false, ack: false } } });
      ch.on('broadcast', { event: 'e' }, ({ payload }) => payload && this.receive(JSON.stringify(payload)));
      this.client = client;
      this.channel = ch;
      const joined = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), 8000);
        ch.subscribe((s) => {
          if (s === 'SUBSCRIBED') {
            clearTimeout(timer);
            resolve(true);
          }
        });
      });
      if (gen !== this.gen) return false;
      if (!joined) throw new Error('canal');
    } catch {
      if (gen === this.gen) await this.disconnect('No se pudo abrir el canal en la nube.');
      return false;
    }
    save({ id, via: 'cloud' });
    for (let i = 0; i < 8 && gen === this.gen && !this.isOn(); i++) {
      this.send({ t: 'hello' });
      await sleep(900);
    }
    if (gen !== this.gen) return false;
    if (!this.isOn()) {
      this.set({ detail: `Don Rover ${id} no contestó. Revisa que esté encendido y conectado a un Wi-Fi con internet.` });
      return false;
    }
    this.startPing(gen);
    return true;
  }

  /** Vuelve a conectar por el último camino que funcionó (sin pedir nada al usuario). */
  async auto(): Promise<boolean> {
    if (this.status.state !== 'off') return this.connected;
    const s = loadSaved();
    const api = serialApi();
    if (api && (s.via === 'usb' || !s.via)) {
      const ports = await api.getPorts().catch(() => []);
      if (ports.length) return this.connectUsb();
    }
    if (s.via === 'lan' && s.ip) return this.connectWifi(s.ip);
    if ((s.via === 'cloud' || s.via === 'http') && s.id) return this.connectCloud(s.id);
    return false;
  }

  /** Deja libre el puerto USB (para el instalador de firmware). */
  async releaseUsb(): Promise<void> {
    if (this.status.via === 'usb') await this.disconnect('Puerto USB libre para instalar el firmware.');
  }
}

const LABEL: Record<Transport, string> = { usb: 'USB', lan: 'Wi-Fi (red local)', http: 'Wi-Fi (red local)', cloud: 'Wi-Fi (nube)' };
export const transportLabel = (t: Transport | null) => (t ? LABEL[t] : '');

export const rover = new RoverLink();
