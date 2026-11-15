// Función de Vercel: colonias del Taller de Don Rover guardadas en la base de datos de
// Supabase (Postgres). La integración de Supabase en Vercel crea POSTGRES_URL en el proyecto;
// esta función la usa desde el servidor, así que el navegador nunca ve credenciales.
//
// No hay cuentas: cada colonia en la nube tiene un id público y una clave. Juntos forman el
// "código de colonia" (XXXX-XXXX-XXXX-XXXX) que el profesor usa para abrirla en otra
// computadora. La clave solo se guarda como hash.
//
//   GET  /api/colonies                         → estado de la base de datos
//   POST /api/colonies { op: 'save',    id, key, colony }
//   POST /api/colonies { op: 'load',    id, key }
//   POST /api/colonies { op: 'log',     id, key, report }
//   POST /api/colonies { op: 'history', id, key }
//
// Las tablas se crean solas la primera vez (también están en supabase/schema.sql).
// Este archivo no importa nada del proyecto a propósito: así Vercel lo empaqueta sin sorpresas.

import { createHash, timingSafeEqual } from 'node:crypto';
import postgres from 'postgres';

interface Req {
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
}
interface Res {
  status(code: number): Res;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
}

const SCHEMA = `
create table if not exists public.donrover_colonies (
  id text primary key,
  name text not null default '',
  data jsonb not null,
  key_hash text not null,
  sol integer not null default 1,
  missions integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.donrover_missions (
  id bigint generated always as identity primary key,
  colony_id text not null references public.donrover_colonies(id) on delete cascade,
  mission text not null,
  saved boolean not null default false,
  score integer not null default 0,
  players integer not null default 0,
  crews integer not null default 0,
  difficulty text,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists donrover_missions_colony_idx on public.donrover_missions (colony_id, created_at desc);
alter table public.donrover_colonies enable row level security;
alter table public.donrover_missions enable row level security;
`;

/** Cadena de conexión de la integración Supabase ↔ Vercel (sin parámetros que el driver no entiende). */
function databaseUrl(): string | null {
  const raw =
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DB_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    '';
  if (!raw) return null;
  try {
    const u = new URL(raw);
    for (const k of [...u.searchParams.keys()]) if (k !== 'sslmode') u.searchParams.delete(k);
    return u.toString();
  } catch {
    return raw;
  }
}

let client: postgres.Sql | null = null;
let ready: Promise<void> | null = null;

function db(): postgres.Sql | null {
  if (client) return client;
  const url = databaseUrl();
  if (!url) return null;
  // prepare:false porque Supabase usa un pooler en modo transacción; una conexión por instancia.
  // Supabase exige SSL; PGSSLMODE=disable solo sirve para probar con un Postgres local.
  const ssl = process.env.PGSSLMODE === 'disable' ? false : 'require';
  client = postgres(url, { prepare: false, ssl, max: 1, idle_timeout: 20, connect_timeout: 10, onnotice: () => {} });
  return client;
}

async function ensureSchema(sql: postgres.Sql): Promise<void> {
  // Protocolo "simple": permite varias sentencias en una sola consulta.
  ready ??= sql.unsafe(SCHEMA).simple().then(
    () => undefined,
    (err: unknown) => {
      ready = null;
      throw err;
    },
  );
  return ready;
}

const ID_RE = /^[A-Z0-9]{8}$/;
const KEY_RE = /^[A-Z0-9]{8,32}$/;

function hashKey(key: string): string {
  return createHash('sha256').update(`donrover:${key}`).digest('hex');
}

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}

function fail(res: Res, code: number, error: string) {
  res.status(code).json({ ok: false, error });
}

function sameOrigin(req: Req): boolean {
  const origin = req.headers.origin;
  const host = req.headers['x-forwarded-host'] ?? req.headers.host;
  if (typeof origin !== 'string' || typeof host !== 'string') return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

const num = (x: unknown, max = 1e9) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.min(max, Math.round(x))) : 0);
const str = (x: unknown, max: number) => (typeof x === 'string' ? x.slice(0, max) : '');

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store');
  const sql = db();

  if (req.method === 'GET') {
    if (!sql) {
      res.status(200).json({ ok: true, configured: false });
      return;
    }
    try {
      await ensureSchema(sql);
      const [row] = await sql`select count(*)::int as colonies from public.donrover_colonies`;
      res.status(200).json({ ok: true, configured: true, connected: true, colonies: row?.colonies ?? 0 });
    } catch (err) {
      res.status(200).json({ ok: true, configured: true, connected: false, error: String((err as Error).message ?? err).slice(0, 200) });
    }
    return;
  }

  if (req.method !== 'POST') return fail(res, 405, 'Método no permitido.');
  if (!sameOrigin(req)) return fail(res, 403, 'Origen no permitido.');
  if (!sql) return fail(res, 503, 'La base de datos no está configurada en este despliegue.');

  let body: Record<string, unknown>;
  try {
    body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as Record<string, unknown>;
  } catch {
    return fail(res, 400, 'Cuerpo inválido.');
  }
  if (!body || typeof body !== 'object') return fail(res, 400, 'Cuerpo inválido.');
  const op = body.op;
  const id = str(body.id, 16);
  const key = str(body.key, 40);
  if (!ID_RE.test(id) || !KEY_RE.test(key)) return fail(res, 400, 'Código de colonia inválido.');
  const keyHash = hashKey(key);

  try {
    await ensureSchema(sql);

    if (op === 'save') {
      const colony = body.colony as Record<string, unknown> | undefined;
      if (!colony || typeof colony !== 'object' || typeof colony.id !== 'string' || !colony.sectors || !colony.meters) return fail(res, 400, 'Colonia inválida.');
      const json = JSON.stringify(colony);
      if (json.length > 300_000) return fail(res, 413, 'La colonia es demasiado grande.');
      const name = str(colony.name, 80);
      const sol = num(colony.sol, 100_000);
      const missions = Array.isArray(colony.missions) ? colony.missions.length : 0;
      const rows = await sql`
        insert into public.donrover_colonies (id, name, data, key_hash, sol, missions)
        values (${id}, ${name}, ${sql.json(colony as postgres.JSONValue)}, ${keyHash}, ${sol}, ${missions})
        on conflict (id) do update
          set name = excluded.name, data = excluded.data, sol = excluded.sol, missions = excluded.missions, updated_at = now()
          where public.donrover_colonies.key_hash = excluded.key_hash
        returning id, updated_at`;
      if (!rows.length) return fail(res, 403, 'Ese código ya pertenece a otra colonia.');
      res.status(200).json({ ok: true, updatedAt: rows[0].updated_at });
      return;
    }

    // Las demás operaciones necesitan que la colonia exista y la clave coincida.
    const [row] = await sql`select key_hash, data from public.donrover_colonies where id = ${id}`;
    if (!row || !sameHash(String(row.key_hash), keyHash)) return fail(res, 404, 'No encontramos una colonia con ese código.');

    if (op === 'load') {
      res.status(200).json({ ok: true, colony: row.data });
      return;
    }

    if (op === 'log') {
      const r = (body.report ?? {}) as Record<string, unknown>;
      const summary = (r.summary && typeof r.summary === 'object' ? r.summary : {}) as postgres.JSONValue;
      if (JSON.stringify(summary).length > 20_000) return fail(res, 413, 'Reporte demasiado grande.');
      await sql`
        insert into public.donrover_missions (colony_id, mission, saved, score, players, crews, difficulty, summary)
        values (${id}, ${str(r.mission, 40) || 'mision'}, ${Boolean(r.saved)}, ${num(r.score, 1000)}, ${num(r.players, 1000)}, ${num(r.crews, 100)}, ${str(r.difficulty, 20) || null}, ${sql.json(summary)})`;
      res.status(200).json({ ok: true });
      return;
    }

    if (op === 'history') {
      const rows = await sql`
        select mission, saved, score, players, crews, difficulty, created_at
        from public.donrover_missions where colony_id = ${id}
        order by created_at desc limit 50`;
      res.status(200).json({ ok: true, missions: rows });
      return;
    }

    fail(res, 400, 'Operación desconocida.');
  } catch (err) {
    console.error('[colonies]', err);
    fail(res, 500, 'La base de datos no respondió. Intenta de nuevo.');
  }
}
