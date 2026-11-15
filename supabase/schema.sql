-- Tablas del Taller de Don Rover en Supabase.
--
-- No hace falta ejecutar este archivo: la función /api/colonies las crea sola la primera vez
-- que se usa en Vercel. Está aquí por si prefieres crearlas a mano desde el SQL Editor de
-- Supabase o revisar qué guarda el juego.
--
-- Seguridad: RLS activado y sin políticas → la API pública de Supabase (anon) no puede leer
-- ni escribir estas tablas. Solo las funciones del servidor de Vercel, que se conectan con
-- POSTGRES_URL, tienen acceso. Las claves de colonia se guardan como hash SHA-256.

create table if not exists public.donrover_colonies (
  id text primary key,                         -- primeros 8 caracteres del código de colonia
  name text not null default '',               -- nombre del grupo
  data jsonb not null,                         -- la colonia completa (sectores, edificios, misiones…)
  key_hash text not null,                      -- hash de la clave (últimos 8 caracteres del código)
  sol integer not null default 1,
  missions integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.donrover_missions (
  id bigint generated always as identity primary key,
  colony_id text not null references public.donrover_colonies(id) on delete cascade,
  mission text not null,                       -- greenhouse, water, darkness, signal, habitat, final
  saved boolean not null default false,        -- ¿la clase salvó la colonia en la emergencia?
  score integer not null default 0,            -- puntaje promedio de las tripulaciones
  players integer not null default 0,          -- alumnos (sin contar bots)
  crews integer not null default 0,
  difficulty text,
  summary jsonb not null default '{}'::jsonb,  -- resultado de cada tripulación
  created_at timestamptz not null default now()
);

create index if not exists donrover_missions_colony_idx on public.donrover_missions (colony_id, created_at desc);

alter table public.donrover_colonies enable row level security;
alter table public.donrover_missions enable row level security;
