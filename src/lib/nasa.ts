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

let weatherCache: { at: number; value: SpaceWeather | null } | null = null;

/** Clima espacial real de DONKI (últimos días), con nivel de riesgo. */
export async function spaceWeather(days = 14): Promise<SpaceWeather | null> {
  if (weatherCache && Date.now() - weatherCache.at < 10 * 60_000) return weatherCache.value;
  const data = await get<{ weather: SpaceWeather }>(`op=weather&days=${days}`);
  const value = data?.weather ?? null;
  weatherCache = { at: Date.now(), value };
  return value;
}
