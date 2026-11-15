// Cliente de la función /api/nasa (datos reales de la NASA). Si el despliegue no tiene la
// función (p. ej. `npm run dev`) o la NASA no responde, devuelve null y el juego sigue con
// su contenido propio.

import type { NasaStudy, SpaceWeather } from '../../shared/nasa';

async function get<T>(query: string, timeoutMs = 9000): Promise<T | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(new URL(`api/nasa?${query}`, document.baseURI).toString(), { signal: ctrl.signal });
    if (!(res.headers.get('content-type') ?? '').includes('application/json')) return null;
    const data = (await res.json()) as T & { ok?: boolean };
    return data?.ok ? data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Estudios científicos reales (NTRS + OSDR) sobre un tema. */
export async function nasaStudies(ntrs: string, osdr: string, n = 6): Promise<NasaStudy[]> {
  const q = new URLSearchParams({ op: 'studies', q: ntrs, osdr, n: String(n) });
  const data = await get<{ studies: NasaStudy[] }>(q.toString());
  return Array.isArray(data?.studies) ? data.studies : [];
}

export interface NasaSource {
  name: string;
  ok: boolean;
  ms: number;
}

/** Comprueba en vivo la conexión con las tres fuentes de la NASA (null = sin función /api/nasa). */
export async function nasaCheck(): Promise<{ key: boolean; sources: NasaSource[] } | null> {
  const data = await get<{ key: boolean; sources: NasaSource[] }>('op=check', 12000);
  return data && Array.isArray(data.sources) ? { key: Boolean(data.key), sources: data.sources } : null;
}

export interface Apod {
  title: string;
  date: string;
  explanation: string;
  url: string;
  page: string;
  media: string;
}

/** Foto astronómica del día de la NASA (APOD). */
export async function nasaApod(): Promise<Apod | null> {
  const data = await get<{ apod: Apod }>('op=apod');
  return data?.apod?.title ? data.apod : null;
}

export interface NeoToday {
  date: string;
  count: number;
  hazardous: number;
  closest: { name: string; diameterM: number | null; hazardous: boolean; missKm: number | null; lunar: number | null; kmh: number | null; url: string }[];
}

/** Asteroides que pasan cerca de la Tierra hoy (NeoWs). */
export async function nasaNeo(): Promise<NeoToday | null> {
  const data = await get<{ neo: NeoToday }>('op=neo');
  return data?.neo ?? null;
}

let weatherCache: { at: number; value: SpaceWeather | null } | null = null;

/** Clima espacial real de DONKI (últimos días), con nivel de riesgo. */
export async function spaceWeather(days = 14): Promise<SpaceWeather | null> {
  if (weatherCache && Date.now() - weatherCache.at < 10 * 60_000) return weatherCache.value;
  const data = await get<{ weather: SpaceWeather }>(`op=weather&days=${days}`);
  const value = data?.weather ?? null;
  weatherCache = { at: Date.now(), value };
  return value;
}
