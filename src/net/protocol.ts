// Protocolo entre los celulares (jugadores) y el navegador del profesor (anfitrión),
// transportado por canales de datos WebRTC (PeerJS). Solo la señalización inicial pasa
// por un servidor público; el juego viaja directo entre dispositivos y cifrado (DTLS).

import type { PeerJSOption } from 'peerjs';
import type { Signaling } from '../engine/settings';
import type { AvatarConfig, PlayerAction, PlayerView } from '../../shared/types';
import type { PresenceMap, PresencePose, WorldSnapshot } from '../world/colony/snapshot';

export const PEER_PREFIX = 'ixchel-mars-v1-';

export type ToHost =
  | { t: 'join'; name: string; avatar: AvatarConfig; xp: number; token?: string }
  | { t: 'act'; rid: number; action: PlayerAction }
  | { t: 'hb' }
  /** Pose del astronauta en el mundo 3D (null = salió del mundo). */
  | { t: 'pos'; p: PresencePose | null };

export type ToPlayer =
  | { t: 'joined'; playerId: string; token: string; name: string }
  | { t: 'error'; error: string }
  | { t: 'ack'; rid: number; ok: boolean; error?: string }
  | { t: 'view'; view: PlayerView }
  | { t: 'kicked' }
  /** Estado de la colonia para el mundo 3D (salud, edificios, tripulaciones…). */
  | { t: 'world'; world: WorldSnapshot }
  /** Poses de los compañeros que están jugando en 3D. */
  | { t: 'peers'; peers: PresenceMap };

/** ¿Es una pose válida? (los datos de la red no son de fiar). */
export function isPose(p: unknown): p is PresencePose {
  return Array.isArray(p) && p.length === 6 && p.every((n) => typeof n === 'number' && Number.isFinite(n)) && Math.abs(Math.hypot(p[0], p[1], p[2]) - 1) < 0.05;
}

/**
 * Servidores STUN que funcionan hoy. Los TURN que PeerJS trae por defecto
 * (eu-0/us-0.turn.peerjs.com) ya no existen en DNS, así que no los usamos.
 */
export const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

export function peerOptions(sig: Signaling | null | undefined): PeerJSOption {
  const base: PeerJSOption = { debug: 0, config: { iceServers: ICE_SERVERS } };
  if (sig?.host) return { ...base, host: sig.host, port: sig.port || 443, path: sig.path || '/', secure: sig.secure };
  return base;
}

/** Codifica un servidor de señalización propio dentro del enlace del QR. */
export function encodeSignaling(sig: Signaling | null): string {
  if (!sig?.host) return '';
  return btoa(JSON.stringify(sig)).replace(/=+$/, '');
}

export function decodeSignaling(raw: string | null): Signaling | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(atob(raw)) as Signaling;
    return s && typeof s.host === 'string' ? s : null;
  } catch {
    return null;
  }
}
