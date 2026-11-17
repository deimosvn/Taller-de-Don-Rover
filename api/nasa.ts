// Función de Vercel: datos reales de la NASA para el Taller de Don Rover.
//
//   GET /api/nasa?op=status
//   GET /api/nasa?op=studies&q=<inglés>&osdr=<inglés>&n=6
//        Estudios científicos reales: NTRS (Servidor de Reportes Técnicos de la NASA, todas
//        las publicaciones científicas) + OSDR (Repositorio de Datos Científicos Abiertos:
//        biología espacial y efectos del espacio en el cuerpo).
//   GET /api/nasa?op=weather&days=14
//        Clima espacial real de DONKI (api.nasa.gov): eyecciones de masa coronal, tormentas
//        geomagnéticas, partículas solares energéticas y llamaradas, con un nivel de riesgo.
//
// La clave va en la variable de entorno NASA_API_KEY de Vercel (nunca en el código). Sin
// clave se usa DEMO_KEY, que funciona con límites muy bajos. Las respuestas se guardan en
// caché (memoria + CDN de Vercel) para no gastar el límite de la clave.
// Este archivo no importa nada del proyecto a propósito: así Vercel lo empaqueta sin sorpresas.

interface Req {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
  headers: Record<string, string | string[] | undefined>;
}
interface Res {
  status(code: number): Res;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
}

export interface Study {
  id: string;
  source: 'NTRS' | 'OSDR';
  title: string;
  summary: string;
  year: number | null;
  url: string;
  organism?: string;
  platform?: string;
  factors?: string[];
}

export interface SpaceWeather {
  level: 0 | 1 | 2 | 3;
  label: string;
  headline: string;
  lines: string[];
  from: string;
  to: string;
  cmes: number;
  fastestCme: number;
  maxKp: number;
  sep: number;
  flares: number;
  strongestFlare: string | null;
  updatedAt: string;
}

const KEY = process.env.NASA_API_KEY || 'DEMO_KEY';
const cache = new Map<string, { at: number; ttl: number; value: unknown }>();

async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), ttl: ttlMs, value });
  if (cache.size > 200) cache.delete(cache.keys().next().value as string);
  return value;
}

async function getJson(url: string, timeoutMs = 9000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json', 'user-agent': 'taller-don-rover/1.0' } });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`${res.status}`);
    const text = await res.text();
    return text.trim() ? JSON.parse(text) : [];
  } finally {
    clearTimeout(t);
  }
}

const clean = (s: unknown, max: number): string => {
  const text = String(s ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const dot = cut.lastIndexOf('. ');
  return (dot > max * 0.5 ? cut.slice(0, dot + 1) : cut.replace(/\s+\S*$/, '')) + (dot > max * 0.5 ? '' : '…');
};

const arr = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? (x as Record<string, unknown>[]) : []);

/* ------------------------------------------------------------------ */
/* Estudios: NTRS + OSDR                                                */
/* ------------------------------------------------------------------ */

async function ntrs(q: string, n: number): Promise<Study[]> {
  const url = `https://ntrs.nasa.gov/api/citations/search?q=${encodeURIComponent(q)}&page.size=${Math.max(n * 2, 8)}`;
  const data = (await getJson(url)) as { results?: unknown };
  return arr(data?.results)
    .filter((r) => r.title && r.abstract)
    .slice(0, n)
    .map((r) => {
      const pubs = arr(r.publications);
      const date = String(pubs[0]?.publicationDate ?? r.created ?? '');
      const year = /^(\d{4})/.exec(date)?.[1];
      return {
        id: `NTRS-${r.id}`,
        source: 'NTRS' as const,
        title: clean(r.title, 220),
        summary: clean(r.abstract, 600),
        year: year ? Number(year) : null,
        url: `https://ntrs.nasa.gov/citations/${r.id}`,
      };
    });
}

async function osdr(q: string, n: number): Promise<Study[]> {
  const url = `https://osdr.nasa.gov/osdr/data/search?term=${encodeURIComponent(q)}&from=0&size=${Math.max(n * 2, 6)}&type=cgene`;
  const data = (await getJson(url)) as { hits?: { hits?: unknown } };
  return arr(data?.hits?.hits)
    .map((h) => (h._source ?? {}) as Record<string, unknown>)
    .filter((s) => s.Accession && s['Study Title'])
    .slice(0, n)
    .map((s) => {
      const released = Number(s['Study Public Release Date']);
      const year = Number.isFinite(released) && released > 0 ? new Date(released * 1000).getUTCFullYear() : null;
      const factors = String(s['Study Factor Name'] ?? '')
        .split(/\s{2,}|,/)
        .map((f) => f.trim())
        .filter(Boolean)
        .slice(0, 4);
      return {
        id: String(s.Accession),
        source: 'OSDR' as const,
        title: clean(s['Study Title'], 220),
        summary: clean(s['Study Description'], 600),
        year,
        url: `https://osdr.nasa.gov/bio/repo/data/studies/${s.Accession}`,
        organism: clean(s.organism, 60) || undefined,
        platform: clean(s['Flight Program'] || s['Experiment Platform'], 80) || undefined,
        factors,
      };
    });
}

/* ------------------------------------------------------------------ */
/* Clima espacial: DONKI                                                */
/* ------------------------------------------------------------------ */

const day = (d: Date) => d.toISOString().slice(0, 10);
const fecha = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' });
};

async function donki(kind: string, from: string, to: string): Promise<Record<string, unknown>[]> {
  try {
    return arr(await getJson(`https://api.nasa.gov/DONKI/${kind}?startDate=${from}&endDate=${to}&api_key=${KEY}`));
  } catch {
    return [];
  }
}

async function weather(days: number): Promise<SpaceWeather> {
  const toD = new Date();
  const fromD = new Date(toD.getTime() - days * 86400_000);
  const from = day(fromD);
  const to = day(toD);
  const [cmes, gsts, seps, flrs] = await Promise.all([donki('CME', from, to), donki('GST', from, to), donki('SEP', from, to), donki('FLR', from, to)]);

  let fastest = 0;
  let fastestAt = '';
  for (const c of cmes) {
    for (const a of arr(c.cmeAnalyses)) {
      const speed = Number(a.speed) || 0;
      if (a.isMostAccurate && speed > fastest) {
        fastest = speed;
        fastestAt = String(c.startTime ?? '');
      }
    }
  }
  let maxKp = 0;
  let kpAt = '';
  for (const g of gsts) {
    for (const k of arr(g.allKpIndex)) {
      const kp = Number(k.kpIndex) || 0;
      if (kp > maxKp) {
        maxKp = kp;
        kpAt = String(k.observedTime ?? g.startTime ?? '');
      }
    }
  }
  const CLASS_RANK: Record<string, number> = { X: 4, M: 3, C: 2, B: 1, A: 0 };
  const rank = (cls: string) => (CLASS_RANK[cls.charAt(0)] ?? 0) * 100 + (parseFloat(cls.slice(1)) || 0);
  let strongest: string | null = null;
  let strongestAt = '';
  for (const f of flrs) {
    const cls = String(f.classType ?? '');
    if (cls && (!strongest || rank(cls) > rank(strongest))) {
      strongest = cls;
      strongestAt = String(f.peakTime ?? f.beginTime ?? '');
    }
  }
  const sep = seps.length;
  const xFlare = strongest?.startsWith('X') ?? false;
  const bigM = strongest?.startsWith('M') && (parseFloat(strongest.slice(1)) || 0) >= 5;

  let level: SpaceWeather['level'] = 0;
  if (sep > 0 || maxKp >= 8 || xFlare) level = 3;
  else if (maxKp >= 6 || fastest >= 1000 || bigM) level = 2;
  else if (maxKp >= 5 || cmes.length >= 10 || strongest?.startsWith('M')) level = 1;

  const labels = ['Tranquilo', 'Moderado', 'Alto', 'Severo'];
  let headline: string;
  if (sep > 0) headline = `Tormenta de radiación solar: ${sep === 1 ? 'un evento' : `${sep} eventos`} de partículas energéticas`;
  else if (xFlare) headline = `Llamarada solar ${strongest} el ${fecha(strongestAt)}`;
  else if (maxKp >= 6) headline = `Tormenta geomagnética Kp ${maxKp} el ${fecha(kpAt)}`;
  else if (fastest >= 1000) headline = `Eyección solar muy rápida (${Math.round(fastest)} km/s) el ${fecha(fastestAt)}`;
  else if (level === 1) headline = `${cmes.length} eyecciones de masa coronal en ${days} días`;
  else headline = `Clima espacial tranquilo en los últimos ${days} días`;

  const lines: string[] = [];
  if (cmes.length) lines.push(`☀️ ${cmes.length} eyecciones de masa coronal${fastest ? ` (la más rápida: ${Math.round(fastest)} km/s)` : ''}`);
  if (maxKp) lines.push(`🧲 Tormenta geomagnética: índice Kp ${maxKp} (${fecha(kpAt)})`);
  lines.push(sep ? `☢️ ${sep} eventos de partículas solares energéticas` : '☢️ Sin eventos de partículas solares energéticas');
  if (strongest) lines.push(`⚡ ${flrs.length} llamaradas solares; la más fuerte, clase ${strongest} (${fecha(strongestAt)})`);

  return {
    level,
    label: labels[level],
    headline,
    lines,
    from,
    to,
    cmes: cmes.length,
    fastestCme: Math.round(fastest),
    maxKp,
    sep,
    flares: flrs.length,
    strongestFlare: strongest,
    updatedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Manejador                                                            */
/* ------------------------------------------------------------------ */

const param = (req: Req, name: string, max = 120): string => {
  const v = req.query?.[name];
  return String(Array.isArray(v) ? v[0] : (v ?? '')).slice(0, max);
};

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Método no permitido.' });
    return;
  }
  const op = param(req, 'op', 20);
  try {
    if (op === 'status') {
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({ ok: true, key: KEY !== 'DEMO_KEY', sources: ['DONKI', 'NTRS', 'OSDR', 'APOD', 'NeoWs'] });
      return;
    }
    if (op === 'check') {
      // Diagnóstico en vivo: una petición pequeña a cada fuente, con su tiempo de respuesta.
      const today = new Date();
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const from = new Date(today.getTime() - 5 * 86400_000);
      const probe = async (name: string, url: string) => {
        const t0 = Date.now();
        try {
          await getJson(url, 8000);
          return { name, ok: true, ms: Date.now() - t0 };
        } catch (err) {
          return { name, ok: false, ms: Date.now() - t0, error: String((err as Error).message).slice(0, 80) };
        }
      };
      const sources = await Promise.all([
        probe('DONKI', `https://api.nasa.gov/DONKI/FLR?startDate=${iso(from)}&endDate=${iso(today)}&api_key=${KEY}`),
        probe('NTRS', 'https://ntrs.nasa.gov/api/citations/search?q=Mars&page.size=1'),
        probe('OSDR', 'https://osdr.nasa.gov/osdr/data/search?term=plant&from=0&size=1&type=cgene'),
      ]);
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({ ok: true, key: KEY !== 'DEMO_KEY', sources });
      return;
    }
    if (op === 'studies') {
      const q = param(req, 'q').trim();
      const oq = param(req, 'osdr').trim() || q;
      const n = Math.max(1, Math.min(8, Number(param(req, 'n', 2)) || 6));
      if (!q && !oq) {
        res.status(400).json({ ok: false, error: 'Falta el tema a buscar.' });
        return;
      }
      const half = Math.ceil(n / 2);
      const studies = await cached(`studies:${q}|${oq}|${n}`, 6 * 3600_000, async () => {
        const [a, b] = await Promise.all([q ? ntrs(q, half).catch(() => []) : [], oq ? osdr(oq, n - half).catch(() => []) : []]);
        // Intercala las dos fuentes para que la IA vea variedad.
        const out: Study[] = [];
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
          if (a[i]) out.push(a[i]);
          if (b[i]) out.push(b[i]);
        }
        return out.slice(0, n);
      });
      res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400');
      res.status(200).json({ ok: true, studies });
      return;
    }
    if (op === 'apod') {
      // Foto astronómica del día (APOD), con la explicación oficial de la NASA.
      const apod = await cached('apod', 3 * 3600_000, async () => {
        // La foto de "hoy" se publica en horario de EE. UU.: si todavía no existe, se usa la de ayer.
        const base = `https://api.nasa.gov/planetary/apod?thumbs=true&api_key=${KEY}`;
        const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
        const o = ((await getJson(base, 7000).catch(() => getJson(`${base}&date=${yesterday}`, 7000))) ?? {}) as Record<string, unknown>;
        const s = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');
        return {
          title: s(o.title, 200),
          date: s(o.date, 10),
          explanation: s(o.explanation, 900),
          url: s(o.media_type === 'video' ? o.thumbnail_url || o.url : o.url, 500),
          page: `https://apod.nasa.gov/apod/ap${s(o.date, 10).slice(2).replace(/-/g, '')}.html`,
          media: s(o.media_type, 10),
        };
      });
      res.setHeader('Cache-Control', 'public, s-maxage=10800, stale-while-revalidate=86400');
      res.status(200).json({ ok: true, apod });
      return;
    }
    if (op === 'neo') {
      // Asteroides que pasan cerca de la Tierra hoy (NeoWs).
      const day = new Date().toISOString().slice(0, 10);
      const neo = await cached(`neo:${day}`, 3 * 3600_000, async () => {
        const o = (await getJson(`https://api.nasa.gov/neo/rest/v1/feed?start_date=${day}&end_date=${day}&api_key=${KEY}`)) as {
          element_count?: number;
          near_earth_objects?: Record<string, Record<string, unknown>[]>;
        };
        const list = Object.values(o.near_earth_objects ?? {}).flat();
        const items = list
          .map((a) => {
            const app = (a.close_approach_data as Record<string, Record<string, string>>[] | undefined)?.[0];
            const dia = (a.estimated_diameter as Record<string, Record<string, number>> | undefined)?.meters;
            return {
              name: String(a.name ?? '').slice(0, 60),
              diameterM: dia ? Math.round((dia.estimated_diameter_min + dia.estimated_diameter_max) / 2) : null,
              hazardous: Boolean(a.is_potentially_hazardous_asteroid),
              missKm: app ? Math.round(Number(app.miss_distance?.kilometers)) : null,
              lunar: app ? Math.round(Number(app.miss_distance?.lunar) * 10) / 10 : null,
              kmh: app ? Math.round(Number(app.relative_velocity?.kilometers_per_hour)) : null,
              url: String(a.nasa_jpl_url ?? '').slice(0, 200),
            };
          })
          .filter((a) => a.missKm !== null)
          .sort((a, b) => (a.missKm ?? 0) - (b.missKm ?? 0));
        return { date: day, count: o.element_count ?? items.length, hazardous: items.filter((a) => a.hazardous).length, closest: items.slice(0, 3) };
      });
      res.setHeader('Cache-Control', 'public, s-maxage=10800, stale-while-revalidate=43200');
      res.status(200).json({ ok: true, neo });
      return;
    }
    if (op === 'weather') {
      const days = Math.max(3, Math.min(30, Number(param(req, 'days', 3)) || 14));
      const w = await cached(`weather:${days}`, 20 * 60_000, () => weather(days));
      res.setHeader('Cache-Control', 'public, s-maxage=1200, stale-while-revalidate=43200');
      res.status(200).json({ ok: true, weather: w });
      return;
    }
    res.status(400).json({ ok: false, error: 'Operación desconocida.' });
  } catch (err) {
    console.error('[nasa]', err);
    res.status(502).json({ ok: false, error: 'La NASA no respondió. Intenta de nuevo en un momento.' });
  }
}
