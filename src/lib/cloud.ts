// Conexión opcional con el servidor de Vercel: base de datos (Supabase) para guardar las
// colonias e historial de misiones, e IA (Claude Opus 5.5) del lado del servidor.
//
// Todo es opcional y tolerante a fallas: si el despliegue no tiene base de datos o IA (o si
// el juego corre sin internet o con `npm run dev`), el juego sigue funcionando igual que
// antes, con las colonias guardadas en este navegador.

import type { ColonyState } from '../../shared/types';

export interface DbStatus {
  configured: boolean;
  connected: boolean;
  colonies?: number;
  error?: string;
}

export interface AiServerStatus {
  enabled: boolean;
  model: string;
}

export interface CloudRef {
  id: string;
  key: string;
}

export interface SyncState {
  at: number | null;
  pending: boolean;
  error: string | null;
}

const MAP_KEY = 'donrover.cloud';
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

let db: DbStatus | null = null;
let ai: AiServerStatus | null = null;
let probing: Promise<void> | null = null;
const listeners = new Set<() => void>();
const sync = new Map<string, SyncState>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function notify() {
  for (const fn of listeners) fn();
}

/** Avisar a la interfaz cuando cambie el estado del servidor o de la sincronización. */
export function subscribeCloud(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function api(path: string): string {
  return new URL(`api/${path}`, document.baseURI).toString();
}

async function request<T>(path: string, init?: RequestInit, timeoutMs = 9000): Promise<{ status: number; data: T | null }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(api(path), { ...init, signal: ctrl.signal, cache: 'no-store' });
    const type = res.headers.get('content-type') ?? '';
    // Sin funciones de servidor (p. ej. `npm run dev`) la ruta devuelve la página HTML.
    if (!type.includes('application/json')) return { status: res.status, data: null };
    return { status: res.status, data: (await res.json()) as T };
  } catch {
    return { status: 0, data: null };
  } finally {
    clearTimeout(t);
  }
}

const post = <T>(path: string, body: unknown, timeoutMs?: number) =>
  request<T>(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, timeoutMs);

/* ------------------------------------------------------------------ */
/* Estado del servidor                                                  */
/* ------------------------------------------------------------------ */

/** Pregunta al servidor qué tiene disponible (una vez por sesión, o de nuevo con `force`). */
export function probeServer(force = false): Promise<void> {
  if (probing && !force) return probing;
  probing = Promise.all([
    request<{ configured?: boolean; connected?: boolean; colonies?: number; error?: string }>('colonies').then(({ data }) => {
      db = data ? { configured: Boolean(data.configured), connected: Boolean(data.connected), colonies: data.colonies, error: data.error } : null;
    }),
    request<{ enabled?: boolean; model?: string }>('ai').then(({ data }) => {
      ai = data ? { enabled: Boolean(data.enabled), model: data.model || 'claude-opus-5-5' } : null;
    }),
  ]).then(() => notify());
  return probing;
}

export function serverStatus(): { db: DbStatus | null; ai: AiServerStatus | null } {
  return { db, ai };
}

/* ------------------------------------------------------------------ */
/* Códigos de colonia                                                   */
/* ------------------------------------------------------------------ */

function token(n: number): string {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

function readMap(): Record<string, CloudRef> {
  try {
    return JSON.parse(localStorage.getItem(MAP_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, CloudRef>) {
  try {
    localStorage.setItem(MAP_KEY, JSON.stringify(map));
  } catch {
    /* almacenamiento bloqueado */
  }
}

export function cloudRef(colonyId: string): CloudRef | null {
  return readMap()[colonyId] ?? null;
}

function ensureRef(colonyId: string, fresh = false): CloudRef {
  const map = readMap();
  if (!map[colonyId] || fresh) {
    map[colonyId] = { id: token(8), key: token(8) };
    writeMap(map);
  }
  return map[colonyId];
}

export function forgetCloud(colonyId: string) {
  const map = readMap();
  delete map[colonyId];
  writeMap(map);
  sync.delete(colonyId);
  notify();
}

/** "K7QF-2MZD-9XRT-BP4H": los primeros 8 caracteres son el id y los últimos 8 la clave. */
export function formatCode(ref: CloudRef): string {
  return `${ref.id}${ref.key}`.match(/.{1,4}/g)!.join('-');
}

export function parseCode(code: string): CloudRef | null {
  const raw = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (raw.length !== 16) return null;
  return { id: raw.slice(0, 8), key: raw.slice(8) };
}

export function syncState(colonyId: string): SyncState | null {
  return sync.get(colonyId) ?? null;
}

/* ------------------------------------------------------------------ */
/* Colonias en la nube                                                  */
/* ------------------------------------------------------------------ */

/** Guarda la colonia en la base de datos (con una pequeña espera para agrupar cambios). */
export function syncColony(colony: ColonyState): void {
  if (typeof window === 'undefined') return;
  const run = () => {
    const prev = timers.get(colony.id);
    if (prev) clearTimeout(prev);
    sync.set(colony.id, { at: sync.get(colony.id)?.at ?? null, pending: true, error: null });
    notify();
    timers.set(
      colony.id,
      setTimeout(() => {
        timers.delete(colony.id);
        void pushColony(colony, false);
      }, 1200),
    );
  };
  if (db?.connected) run();
  else if (db === null) void probeServer().then(() => db?.connected && run());
}

async function pushColony(colony: ColonyState, retried: boolean): Promise<void> {
  const ref = ensureRef(colony.id, false);
  const { status, data } = await post<{ ok: boolean; error?: string }>('colonies', { op: 'save', id: ref.id, key: ref.key, colony });
  if (status === 403 && !retried) {
    // Ese código ya existía en la nube (choque improbable): se genera otro.
    ensureRef(colony.id, true);
    return pushColony(colony, true);
  }
  const ok = Boolean(data?.ok);
  sync.set(colony.id, { at: ok ? Date.now() : (sync.get(colony.id)?.at ?? null), pending: false, error: ok ? null : (data?.error ?? 'Sin conexión con la nube.') });
  notify();
}

/** Trae una colonia desde la nube con su código (para abrirla en otra computadora). */
export async function openFromCode(code: string): Promise<ColonyState> {
  const ref = parseCode(code);
  if (!ref) throw new Error('El código tiene 16 letras y números, como K7QF-2MZD-9XRT-BP4H.');
  if (!db?.connected) await probeServer(true);
  if (!db?.connected) throw new Error('La base de datos no está disponible en este momento.');
  const { data } = await post<{ ok: boolean; colony?: ColonyState; error?: string }>('colonies', { op: 'load', ...ref });
  if (!data?.ok || !data.colony) throw new Error(data?.error ?? 'No se pudo abrir la colonia.');
  const map = readMap();
  map[data.colony.id] = ref;
  writeMap(map);
  sync.set(data.colony.id, { at: Date.now(), pending: false, error: null });
  notify();
  return data.colony;
}

export interface MissionReport {
  mission: string;
  saved: boolean;
  score: number;
  players: number;
  crews: number;
  difficulty: string;
  summary: Record<string, unknown>;
}

/** Registra una misión terminada en el historial de la colonia. */
export function logMission(colony: ColonyState, report: MissionReport): void {
  if (!db?.connected) return;
  const ref = cloudRef(colony.id);
  if (!ref) return;
  // La colonia se guarda primero (con la espera de syncColony), así que esperamos un poco más.
  setTimeout(() => void post('colonies', { op: 'log', ...ref, report }), 2500);
}

export interface MissionRow {
  mission: string;
  saved: boolean;
  score: number;
  players: number;
  crews: number;
  difficulty: string | null;
  created_at: string;
}

export async function missionHistory(colonyId: string): Promise<MissionRow[]> {
  const ref = cloudRef(colonyId);
  if (!ref || !db?.connected) return [];
  const { data } = await post<{ ok: boolean; missions?: MissionRow[] }>('colonies', { op: 'history', ...ref });
  return data?.ok && Array.isArray(data.missions) ? data.missions : [];
}

/* ------------------------------------------------------------------ */
/* IA del servidor (Claude Opus 5.5)                                    */
/* ------------------------------------------------------------------ */

export type AiTask = 'plan' | 'narrative' | 'logs' | 'debrief' | 'trainer' | 'coach';

/** Pide una tarea a la IA del servidor. Devuelve el JSON crudo (se valida en el motor) o null. */
export async function serverAi(task: AiTask, input: Record<string, unknown>): Promise<unknown | null> {
  if (!ai?.enabled) return null;
  const { data } = await post<{ ok: boolean; data?: unknown; error?: string }>('ai', { task, input }, 55_000);
  if (!data?.ok) {
    if (data?.error) console.warn('[ai/servidor]', data.error);
    return null;
  }
  return data.data ?? null;
}
