// Ajustes del profesor (se guardan solo en este navegador).

export interface Signaling {
  host: string;
  port: number;
  path: string;
  secure: boolean;
}

export interface HostSettings {
  apiKey: string;
  model: string;
  joinBase: string;
  signaling: Signaling | null;
  sound: boolean;
}

const KEY = 'ixchel.settings';

export const DEFAULT_SETTINGS: HostSettings = {
  apiKey: '',
  model: 'claude-opus-5-5',
  joinBase: '',
  signaling: null,
  sound: true,
};

export function loadSettings(): HostSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: HostSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* almacenamiento no disponible */
  }
}

/** Dominio público de producción (Vercel lo informa al compilar; vacío fuera de Vercel). */
const PUBLIC_HOST: string = String(import.meta.env.VITE_PUBLIC_HOST ?? '');

/**
 * Cada despliegue de Vercel tiene además su propia URL (proyecto-hash-equipo.vercel.app) que,
 * con la protección de despliegues, pide iniciar sesión en Vercel. Si el profesor abrió la
 * consola desde una de esas, el QR debe llevar a los celulares al dominio público.
 */
function publicBase(url: URL): string | null {
  const host = url.host;
  if (!host.endsWith('.vercel.app')) return null;
  const pub = PUBLIC_HOST || (host.startsWith('tallerdedonrover-') ? 'tallerdedonrover.vercel.app' : '');
  if (!pub || host === pub) return null;
  return `https://${pub}/`;
}

/** URL base que se codifica en el QR (la app publicada; por defecto, esta misma página). */
export function joinBaseUrl(s: HostSettings = loadSettings()): string {
  const { origin, pathname } = window.location;
  const raw = s.joinBase.trim() ? s.joinBase.trim().replace(/#.*$/, '').replace(/\/?$/, '/') : origin + pathname.replace(/[^/]*$/, '');
  try {
    return publicBase(new URL(raw)) ?? raw;
  } catch {
    return raw;
  }
}

export function joinUrl(code: string, s?: HostSettings) {
  return `${joinBaseUrl(s)}#/jugar?c=${code}`;
}
