// Lado del profesor: abre un "peer" con el código de la sala y atiende a cada celular.
// Los celulares llegan directo (WebRTC) o, si su red no lo permite, por el canal de respaldo
// de Supabase Realtime (ver relay.ts). Para el juego las dos vías son iguales.

import Peer, { type DataConnection } from 'peerjs';
import type { HostEngine } from '../engine/room';
import type { Signaling } from '../engine/settings';
import { snapshotFromHost } from '../world/colony/fromGame';
import type { PresenceMap, PresencePose } from '../world/colony/snapshot';
import { PEER_PREFIX, isPose, peerOptions, type ToHost, type ToPlayer } from './protocol';
import { RelayHost, type Link } from './relay';

export interface NetStatus {
  state: 'starting' | 'online' | 'reconnecting' | 'offline';
  detail: string;
  peers: number;
}

interface Entry {
  conn: Link;
  playerId: string | null;
  lastSeen: number;
  lastSent: string;
  lastWorld: string;
  lastPeers: string;
}

/** Cada cuánto se reenvían las poses de los astronautas (ms). */
const PRESENCE_MS = 200;
/** Una pose sin noticias durante este tiempo se descarta (ms). */
const PRESENCE_TTL = 8000;

export class HostNet {
  private peer: Peer | null = null;
  private conns = new Map<string, Entry>();
  private unsub: (() => void) | null = null;
  private hb: ReturnType<typeof setInterval> | null = null;
  private presenceTimer: ReturnType<typeof setInterval> | null = null;
  private readonly presence = new Map<string, { pose: PresencePose; at: number }>();
  private presenceDirty = false;
  private beat = 0;
  private destroyed = false;
  private retries = 0;
  private relay: RelayHost | null = null;
  private relayOn = false;
  status: NetStatus = { state: 'starting', detail: 'Abriendo la colonia…', peers: 0 };

  /** Poses de los alumnos que juegan en 3D (para la vista 3D del proyector). */
  presenceMap(): PresenceMap {
    const out: PresenceMap = {};
    for (const [id, p] of this.presence) out[id] = p.pose;
    return out;
  }

  constructor(
    private engine: HostEngine,
    private signaling: Signaling | null,
    private onStatus: (s: NetStatus) => void,
    private onCodeTaken: () => void,
  ) {}

  start() {
    this.open();
    this.relay = new RelayHost(
      this.engine.code,
      {
        onOpen: (link) => this.adopt(link),
        onMessage: (link, msg) => {
          const entry = this.conns.get(link.id);
          if (entry) this.onData(entry, msg);
        },
        onClose: (link) => this.dropLink(link),
      },
      (on) => {
        this.relayOn = on;
        this.setStatus(this.status.state, this.status.detail);
      },
    );
    void this.relay.start();
    this.unsub = this.engine.subscribe(() => this.pushViews(false));
    this.hb = setInterval(() => this.heartbeat(), 4000);
    this.presenceTimer = setInterval(() => this.broadcastPresence(), PRESENCE_MS);
  }

  stop() {
    this.destroyed = true;
    this.unsub?.();
    if (this.hb) clearInterval(this.hb);
    if (this.presenceTimer) clearInterval(this.presenceTimer);
    for (const e of this.conns.values()) e.conn.close();
    this.conns.clear();
    this.relay?.stop();
    this.peer?.destroy();
  }

  private setStatus(state: NetStatus['state'], detail: string) {
    // Con el respaldo activo los celulares pueden unirse aunque la vía directa falle.
    if (this.relayOn && state !== 'online') {
      state = 'online';
      detail = 'Colonia en línea por el canal de respaldo: los celulares pueden unirse';
    }
    this.status = { state, detail, peers: [...this.conns.values()].filter((e) => e.playerId).length };
    this.onStatus(this.status);
  }

  private open() {
    if (this.destroyed) return;
    const peer = new Peer(PEER_PREFIX + this.engine.code, peerOptions(this.signaling));
    this.peer = peer;
    // Si el servidor de señalización nunca responde, no nos quedamos en "Abriendo la colonia…".
    const openTimer = setTimeout(() => {
      if (this.destroyed || this.peer !== peer || peer.open || peer.destroyed) return;
      this.setStatus('reconnecting', 'El servidor de conexión no responde; reintentando…');
      peer.destroy();
      this.open();
    }, 15000);
    peer.on('open', () => {
      clearTimeout(openTimer);
      this.retries = 0;
      this.setStatus('online', 'Colonia en línea: los celulares pueden unirse');
    });
    peer.on('connection', (conn) => this.accept(conn));
    peer.on('disconnected', () => {
      if (this.destroyed || peer.destroyed) return;
      this.setStatus('reconnecting', 'Reconectando la señal…');
      setTimeout(() => {
        if (!this.destroyed && !peer.destroyed && peer.disconnected) peer.reconnect();
      }, 2000);
    });
    peer.on('error', (e: { type?: string }) => {
      const type = e?.type ?? '';
      if (this.destroyed) return;
      if (type === 'unavailable-id') {
        // El código todavía está registrado (por ejemplo, recargamos la página): reintentamos.
        peer.destroy();
        if (this.retries++ < 8) {
          this.setStatus('reconnecting', 'Recuperando el código de la sala…');
          setTimeout(() => this.open(), 2500);
        } else {
          this.onCodeTaken();
        }
        return;
      }
      if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') {
        this.setStatus('offline', 'Sin conexión: la misión sigue en modo demo con bots');
        peer.destroy();
        setTimeout(() => this.open(), 6000);
        return;
      }
      if (type === 'browser-incompatible') {
        this.setStatus('offline', 'Este navegador no soporta WebRTC');
        return;
      }
      console.warn('[ixchel/net]', type, e);
    });
  }

  /** Celular que llega directo por WebRTC. */
  private accept(conn: DataConnection) {
    const link: Link = {
      id: conn.connectionId,
      via: 'p2p',
      get open() {
        return conn.open;
      },
      send: (msg) => void conn.send(msg),
      close: () => conn.close(),
    };
    conn.on('open', () => this.adopt(link));
    conn.on('data', (raw) => {
      const entry = this.conns.get(link.id) ?? this.adopt(link);
      this.onData(entry, raw as ToHost);
    });
    const drop = () => this.dropLink(link);
    conn.on('close', drop);
    conn.on('error', drop);
  }

  private adopt(link: Link): Entry {
    const known = this.conns.get(link.id);
    if (known && known.conn === link) return known;
    const entry: Entry = { conn: link, playerId: null, lastSeen: Date.now(), lastSent: '', lastWorld: '', lastPeers: '' };
    this.conns.set(link.id, entry);
    return entry;
  }

  private dropLink(link: Link) {
    const entry = this.conns.get(link.id);
    if (!entry || entry.conn !== link) return;
    this.conns.delete(link.id);
    if (entry.playerId && ![...this.conns.values()].some((e) => e.playerId === entry.playerId)) {
      this.engine.setConnected(entry.playerId, false);
      if (this.presence.delete(entry.playerId)) this.presenceDirty = true;
    }
    this.setStatus(this.status.state, this.status.detail);
  }

  private send(conn: Link, msg: ToPlayer) {
    try {
      if (conn.open) void conn.send(msg);
    } catch (err) {
      console.warn('[ixchel/net] no se pudo enviar', err);
    }
  }

  private onData(entry: Entry, msg: ToHost) {
    if (!msg || typeof msg !== 'object') return;
    entry.lastSeen = Date.now();
    switch (msg.t) {
      case 'join': {
        const res = this.engine.join(msg);
        if (!res.ok || !res.data) {
          this.send(entry.conn, { t: 'error', error: res.error ?? 'No se pudo entrar a la colonia.' });
          return;
        }
        for (const [id, other] of this.conns) {
          if (other !== entry && other.playerId === res.data.playerId) {
            other.conn.close();
            this.conns.delete(id);
          }
        }
        entry.playerId = res.data.playerId;
        entry.lastSent = '';
        entry.lastWorld = '';
        entry.lastPeers = '';
        this.send(entry.conn, { t: 'joined', ...res.data });
        this.engine.setConnected(res.data.playerId, true);
        this.sendView(entry, true);
        this.sendWorld(entry, this.worldJson());
        this.setStatus(this.status.state, this.status.detail);
        break;
      }
      case 'pos': {
        if (!entry.playerId) return;
        if (msg.p === null) {
          if (this.presence.delete(entry.playerId)) this.presenceDirty = true;
        } else if (isPose(msg.p)) {
          this.presence.set(entry.playerId, { pose: msg.p, at: Date.now() });
          this.presenceDirty = true;
        }
        break;
      }
      case 'act': {
        if (!entry.playerId) {
          this.send(entry.conn, { t: 'ack', rid: msg.rid, ok: false, error: 'Primero únete a la colonia.' });
          return;
        }
        const res = this.engine.playerAction(entry.playerId, msg.action);
        if (msg.rid) this.send(entry.conn, { t: 'ack', rid: msg.rid, ok: res.ok, error: res.error });
        break;
      }
      case 'hb':
        break;
    }
  }

  private sendView(entry: Entry, force: boolean) {
    if (!entry.playerId) return;
    const view = this.engine.playerView(entry.playerId);
    if (!view) {
      this.send(entry.conn, { t: 'kicked' });
      setTimeout(() => entry.conn.close(), 300);
      return;
    }
    const key = JSON.stringify({ ...view, now: 0 });
    if (!force && key === entry.lastSent) return;
    entry.lastSent = key;
    this.send(entry.conn, { t: 'view', view });
  }

  private pushViews(force: boolean) {
    const world = this.conns.size ? this.worldJson() : '';
    for (const e of this.conns.values()) {
      this.sendView(e, force);
      if (world) this.sendWorld(e, world);
    }
  }

  /** Estado de la colonia para el mundo 3D de los celulares (se manda solo si cambió). */
  private worldJson(): string {
    try {
      return JSON.stringify(snapshotFromHost(this.engine.hostView()));
    } catch {
      return '';
    }
  }

  private sendWorld(entry: Entry, json: string) {
    if (!entry.playerId || !json || json === entry.lastWorld) return;
    entry.lastWorld = json;
    this.send(entry.conn, { t: 'world', world: JSON.parse(json) });
  }

  /** Reenvía las poses a quienes están en 3D (a cada uno, las de los demás). */
  private broadcastPresence() {
    const now = Date.now();
    for (const [id, p] of this.presence) {
      if (now - p.at > PRESENCE_TTL) {
        this.presence.delete(id);
        this.presenceDirty = true;
      }
    }
    if (!this.presenceDirty) return;
    this.presenceDirty = false;
    for (const e of this.conns.values()) {
      if (!e.playerId || !this.presence.has(e.playerId)) continue;
      const peers: PresenceMap = {};
      for (const [id, p] of this.presence) if (id !== e.playerId) peers[id] = p.pose;
      const key = JSON.stringify(peers);
      if (key === e.lastPeers) continue;
      e.lastPeers = key;
      this.send(e.conn, { t: 'peers', peers });
    }
  }

  private heartbeat() {
    const t = Date.now();
    this.beat++;
    for (const [id, e] of this.conns) {
      if (t - e.lastSeen > 16000) {
        e.conn.close();
        this.conns.delete(id);
        if (e.playerId) {
          this.engine.setConnected(e.playerId, false);
          if (this.presence.delete(e.playerId)) this.presenceDirty = true;
        }
      }
    }
    // Cada 8 s reenviamos la vista: sincroniza relojes y confirma que el canal sigue vivo.
    if (this.beat % 2 === 0) this.pushViews(true);
    this.setStatus(this.status.state, this.status.detail);
  }
}
