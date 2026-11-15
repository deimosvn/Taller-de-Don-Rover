// Sala del modo libre: amigos que entran con un enlace y comparten el mismo Marte.
//
// No hay anfitrión fijo ni servidor del juego. El primero que llega a la sala toma el
// identificador público de la sala en PeerJS y hace de "centro": los demás se conectan a él
// y él reparte los mensajes. Si el centro se va, cualquiera de los que quedan ocupa su lugar
// (el mundo vive en todos los dispositivos, así que no se pierde nada).
//
// Si la red no permite conexiones directas (datos móviles, Wi-Fi con aislamiento), los
// mensajes viajan por el canal de respaldo de Supabase Realtime cuando está configurado.
// Todos los mensajes son idempotentes: recibirlos por los dos caminos no hace daño.

import Peer, { type DataConnection } from 'peerjs';
import type { RealtimeChannel, RealtimeClient } from '@supabase/realtime-js';
import type { AvatarConfig } from '../../shared/types';
import type { BlockEdit } from '../world/blocks/BlockWorld';
import type { PresencePose } from '../world/colony/snapshot';
import type { Signaling } from '../engine/settings';
import { PEER_PREFIX, isPose, peerOptions } from './protocol';
import { relayConfig } from './relay';

export interface FreePeer {
  id: string;
  name: string;
  avatar: AvatarConfig;
}

type Msg =
  | { t: 'hi'; id: string; name: string; avatar: AvatarConfig; want?: boolean }
  | { t: 'pos'; id: string; p: PresencePose | null }
  | { t: 'blk'; id: string; e: BlockEdit[] }
  | { t: 'state'; id: string; to: string; e: BlockEdit[] }
  | { t: 'emote'; id: string; e: string }
  | { t: 'bye'; id: string };

export type FreeNetState = 'connecting' | 'online' | 'offline';

export interface FreeNetHandlers {
  onState(state: FreeNetState): void;
  onPeers(peers: FreePeer[]): void;
  onPose(id: string, pose: PresencePose | null): void;
  onEdits(edits: BlockEdit[]): void;
  onEmote?(peer: FreePeer, emote: string): void;
  /** Todos los cambios del mundo, para mandárselos a quien acaba de entrar. */
  snapshot(): BlockEdit[];
}

const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_RE = /^[A-Z2-9]{5}$/;

export function newRoomCode(): string {
  let out = '';
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  for (const b of bytes) out += ROOM_ALPHABET[b % ROOM_ALPHABET.length];
  return out;
}

/** Enlace para invitar a la sala. */
export function roomLink(room: string): string {
  return `${location.origin}${location.pathname}#/libre?sala=${room}`;
}

/** Servidor de señalización propio (el mismo ajuste que usa la clase), si lo hay. */
function savedSignaling(): Signaling | null {
  try {
    const s = JSON.parse(localStorage.getItem('ixchel.sig') || 'null') as Signaling | null;
    return s && typeof s.host === 'string' ? s : null;
  } catch {
    return null;
  }
}

const validAvatar = (a: unknown): a is AvatarConfig => {
  const v = a as AvatarConfig | null;
  return Boolean(v) && [v!.suit, v!.helmet, v!.visor, v!.accessory].every((n) => Number.isInteger(n) && n >= 0 && n < 32);
};

const cleanName = (s: unknown) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16) : '') || 'Astronauta';

interface Seen extends FreePeer {
  at: number;
  p2p: number;
  relay: number;
}

export class FreeNet {
  readonly id: string;
  private peer: Peer | null = null;
  /** Soy el centro de la sala. */
  private hub = false;
  private readonly conns = new Map<string, DataConnection>();
  private upstream: DataConnection | null = null;
  private client: RealtimeClient | null = null;
  private channel: RealtimeChannel | null = null;
  private channelReady = false;
  private readonly seen = new Map<string, Seen>();
  private stopped = false;
  private synced = false;
  private state: FreeNetState = 'connecting';
  private timers: ReturnType<typeof setInterval>[] = [];
  private retry: ReturnType<typeof setTimeout> | null = null;
  private pending: BlockEdit[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly room: string,
    private me: { name: string; avatar: AvatarConfig },
    private readonly handlers: FreeNetHandlers,
  ) {
    this.id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }

  start(): void {
    this.openPeer();
    void this.openRelay();
    this.timers.push(
      setInterval(() => this.hello(), 4000),
      setInterval(() => this.prune(), 3000),
    );
    window.addEventListener('pagehide', this.bye);
  }

  stop(): void {
    this.stopped = true;
    this.bye();
    window.removeEventListener('pagehide', this.bye);
    for (const t of this.timers) clearInterval(t);
    if (this.retry) clearTimeout(this.retry);
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.closePeer();
    void this.channel?.unsubscribe();
    this.client?.disconnect();
    this.channel = null;
    this.client = null;
  }

  /** Quien crea la sala ya tiene el mundo completo: no espera a que nadie se lo mande. */
  markSynced(): void {
    this.synced = true;
  }

  setProfile(me: { name: string; avatar: AvatarConfig }): void {
    this.me = me;
    this.hello();
  }

  /* ---------------- envío ---------------- */

  sendPose(pose: PresencePose | null): void {
    this.send({ t: 'pos', id: this.id, p: pose });
  }

  sendEmote(emote: string): void {
    this.send({ t: 'emote', id: this.id, e: emote });
  }

  /** Cambios de bloques: se agrupan unos milisegundos para mandarlos juntos. */
  sendEdit(edit: BlockEdit): void {
    this.pending.push(edit);
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      const e = this.pending.splice(0);
      if (e.length) this.send({ t: 'blk', id: this.id, e });
    }, 60);
  }

  private bye = (): void => {
    this.send({ t: 'bye', id: this.id });
  };

  private hello(): void {
    this.send({ t: 'hi', id: this.id, name: this.me.name, avatar: this.me.avatar, want: !this.synced });
  }

  private get p2pOpen(): boolean {
    return this.hub ? this.conns.size > 0 : Boolean(this.upstream?.open);
  }

  /** ¿Hay alguien a quien solo se llega por el canal de respaldo? */
  private get needsRelay(): boolean {
    if (!this.p2pOpen) return true;
    const now = Date.now();
    for (const s of this.seen.values()) if (now - s.relay < 9000 && now - s.p2p > 9000) return true;
    return false;
  }

  private send(msg: Msg): void {
    if (this.hub) {
      for (const c of this.conns.values()) if (c.open) c.send(msg);
    } else if (this.upstream?.open) {
      this.upstream.send(msg);
    }
    if (this.channelReady && this.channel && (msg.t !== 'pos' || this.needsRelay)) {
      void this.channel.send({ type: 'broadcast', event: 'm', payload: msg });
    }
  }

  /* ---------------- recepción ---------------- */

  private receive(raw: unknown, via: 'p2p' | 'relay', from?: DataConnection): void {
    const msg = raw as Msg | null;
    if (!msg || typeof msg !== 'object' || typeof msg.id !== 'string' || msg.id === this.id || msg.id.length > 40) return;
    // El centro reenvía a los demás lo que le llega por conexión directa.
    if (this.hub && via === 'p2p') {
      for (const c of this.conns.values()) if (c !== from && c.open) c.send(msg);
    }
    const now = Date.now();
    const known = this.seen.get(msg.id);
    if (known) {
      known.at = now;
      known[via] = now;
    }
    switch (msg.t) {
      case 'hi': {
        if (!validAvatar(msg.avatar)) return;
        const name = cleanName(msg.name);
        const changed = !known || known.name !== name || JSON.stringify(known.avatar) !== JSON.stringify(msg.avatar);
        if (!known) {
          this.seen.set(msg.id, { id: msg.id, name, avatar: msg.avatar, at: now, p2p: via === 'p2p' ? now : 0, relay: via === 'relay' ? now : 0 });
          this.hello();
        } else {
          known.name = name;
          known.avatar = msg.avatar;
        }
        if (changed) this.emitPeers();
        // El más "antiguo" de la sala le manda el mundo al que acaba de llegar.
        if (msg.want && this.synced && this.isEldest(msg.id)) this.sendState(msg.id);
        break;
      }
      case 'pos':
        if (msg.p === null || isPose(msg.p)) this.handlers.onPose(msg.id, msg.p);
        break;
      case 'blk':
        if (Array.isArray(msg.e)) this.handlers.onEdits(msg.e.slice(0, 4000));
        break;
      case 'state':
        if (msg.to === this.id && Array.isArray(msg.e)) {
          this.handlers.onEdits(msg.e.slice(0, 20000));
          this.synced = true;
        }
        break;
      case 'emote': {
        if (known && typeof msg.e === 'string') this.handlers.onEmote?.(known, msg.e.slice(0, 12));
        break;
      }
      case 'bye':
        if (this.seen.delete(msg.id)) {
          this.handlers.onPose(msg.id, null);
          this.emitPeers();
        }
        break;
    }
  }

  private isEldest(except: string): boolean {
    for (const id of this.seen.keys()) if (id !== except && id < this.id) return false;
    return true;
  }

  private sendState(to: string): void {
    const all = this.handlers.snapshot();
    if (!all.length) {
      this.send({ t: 'state', id: this.id, to, e: [] });
      return;
    }
    for (let i = 0; i < all.length; i += 1500) this.send({ t: 'state', id: this.id, to, e: all.slice(i, i + 1500) });
  }

  private prune(): void {
    const now = Date.now();
    let changed = false;
    for (const [id, s] of this.seen) {
      if (now - s.at > 13000) {
        this.seen.delete(id);
        this.handlers.onPose(id, null);
        changed = true;
      }
    }
    if (changed) this.emitPeers();
    // Si nadie contesta en unos segundos, este dispositivo ya tiene el mundo "oficial".
    if (!this.synced && (this.hub || this.channelReady) && now - this.startedAt > 5000) this.synced = true;
    this.setState(this.hub || this.upstream?.open || this.channelReady ? 'online' : this.peer ? 'connecting' : 'offline');
  }

  private readonly startedAt = Date.now();

  private emitPeers(): void {
    this.handlers.onPeers([...this.seen.values()].map(({ id, name, avatar }) => ({ id, name, avatar })));
  }

  private setState(s: FreeNetState): void {
    if (s === this.state) return;
    this.state = s;
    this.handlers.onState(s);
  }

  /* ---------------- conexión directa (PeerJS) ---------------- */

  private closePeer(): void {
    for (const c of this.conns.values()) c.close();
    this.conns.clear();
    this.upstream = null;
    this.hub = false;
    try {
      this.peer?.destroy();
    } catch {
      /* ya estaba cerrada */
    }
    this.peer = null;
  }

  private again(ms: number): void {
    if (this.stopped || this.retry) return;
    this.retry = setTimeout(() => {
      this.retry = null;
      if (this.stopped) return;
      this.closePeer();
      this.openPeer();
    }, ms);
  }

  /** Intenta ser el centro de la sala; si ya hay uno, se conecta a él. */
  private openPeer(): void {
    const hubId = `${PEER_PREFIX}libre-${this.room}`;
    const opts = peerOptions(savedSignaling());
    let peer: Peer;
    try {
      peer = new Peer(hubId, opts);
    } catch {
      this.again(5000);
      return;
    }
    this.peer = peer;
    peer.on('open', () => {
      if (this.peer !== peer) return;
      this.hub = true;
      this.setState('online');
    });
    peer.on('connection', (conn) => {
      conn.on('open', () => {
        this.conns.set(conn.peer, conn);
        this.hello();
      });
      conn.on('data', (d) => this.receive(d, 'p2p', conn));
      const drop = () => this.conns.delete(conn.peer);
      conn.on('close', drop);
      conn.on('error', drop);
    });
    peer.on('error', (err) => {
      if (this.peer !== peer) return;
      const type = (err as { type?: string }).type;
      if (type === 'unavailable-id') {
        // Ya hay un centro: entrar como invitado.
        try {
          peer.destroy();
        } catch {
          /* nada */
        }
        this.joinHub(hubId);
      } else if (!this.hub) {
        this.again(4000 + Math.random() * 2000);
      }
    });
    peer.on('disconnected', () => {
      if (this.peer !== peer || this.stopped) return;
      // Se cayó la señalización: se reintenta con calma (las conexiones abiertas siguen vivas).
      setTimeout(() => {
        if (this.peer !== peer || this.stopped || peer.destroyed || !peer.disconnected) return;
        try {
          peer.reconnect();
        } catch {
          this.again(3000);
        }
      }, 3500 + Math.random() * 2500);
    });
  }

  private joinHub(hubId: string): void {
    if (this.stopped) return;
    const peer = new Peer(peerOptions(savedSignaling()));
    this.peer = peer;
    this.hub = false;
    let opened = false;
    const failTimer = setTimeout(() => {
      if (!opened && this.peer === peer) this.again(1500 + Math.random() * 2500);
    }, 12000);
    peer.on('open', () => {
      if (this.peer !== peer) return;
      const conn = peer.connect(hubId, { reliable: true });
      conn.on('open', () => {
        opened = true;
        clearTimeout(failTimer);
        this.upstream = conn;
        this.setState('online');
        this.hello();
      });
      conn.on('data', (d) => this.receive(d, 'p2p'));
      const lost = () => {
        if (this.upstream === conn) this.upstream = null;
        clearTimeout(failTimer);
        // El centro se fue: alguien de la sala toma su lugar (espera aleatoria para no chocar).
        if (this.peer === peer) this.again(400 + Math.random() * 2200);
      };
      conn.on('close', lost);
      conn.on('error', lost);
    });
    peer.on('error', (err) => {
      if (this.peer !== peer) return;
      clearTimeout(failTimer);
      const type = (err as { type?: string }).type;
      // "peer-unavailable": el centro desapareció entre un intento y otro.
      this.again(type === 'peer-unavailable' ? 300 + Math.random() * 1500 : 4000);
    });
  }

  /* ---------------- canal de respaldo (Supabase Realtime) ---------------- */

  private async openRelay(): Promise<void> {
    const cfg = await relayConfig();
    if (!cfg || this.stopped) return;
    try {
      const { RealtimeClient } = await import('@supabase/realtime-js');
      const client = new RealtimeClient(`${cfg.url.replace(/^http/, 'ws')}/realtime/v1`, { params: { apikey: cfg.key }, heartbeatIntervalMs: 15000 });
      client.connect();
      const ch = client.channel(`donrover-libre-${this.room}`, { config: { broadcast: { self: false, ack: false } } });
      ch.on('broadcast', { event: 'm' }, (m) => this.receive(m.payload, 'relay'));
      ch.subscribe((status) => {
        this.channelReady = status === 'SUBSCRIBED';
        if (this.channelReady) this.hello();
      });
      this.client = client;
      this.channel = ch;
    } catch {
      /* sin respaldo: solo conexión directa */
    }
  }
}
