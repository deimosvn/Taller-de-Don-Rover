// Lado del celular: se conecta al navegador del profesor y se reconecta solo si el
// teléfono se bloquea, cambia de red o el profesor recarga la página.

import Peer, { type DataConnection } from 'peerjs';
import type { Signaling } from '../engine/settings';
import type { Ack, AvatarConfig, PlayerAction, PlayerView } from '../../shared/types';
import type { PresenceMap, PresencePose, WorldSnapshot } from '../world/colony/snapshot';
import { PEER_PREFIX, isPose, peerOptions, type ToHost, type ToPlayer } from './protocol';

export type PlayerNetState = 'connecting' | 'connected' | 'reconnecting' | 'notfound' | 'error' | 'kicked';

export interface JoinInfo {
  name: string;
  avatar: AvatarConfig;
  xp: number;
  token?: string;
}

interface Handlers {
  onState: (s: PlayerNetState) => void;
  onView: (v: PlayerView) => void;
  onJoined: (info: { playerId: string; token: string; name: string }) => void;
  onError: (msg: string) => void;
}

export class PlayerNet {
  /** Último estado de la colonia para el mundo 3D. */
  world: WorldSnapshot | null = null;
  /** Se llama cuando cambia el estado de la colonia. */
  onWorld: ((w: WorldSnapshot) => void) | null = null;
  /** Se llama con las poses de los compañeros que juegan en 3D. */
  onPeers: ((p: PresenceMap) => void) | null = null;
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private pending = new Map<number, (a: Ack) => void>();
  private nextRid = 1;
  private lastMsg = 0;
  private hb: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private stopped = false;
  private notFoundCount = 0;
  state: PlayerNetState = 'connecting';

  constructor(
    private code: string,
    private signaling: Signaling | null,
    private joinInfo: () => JoinInfo,
    private h: Handlers,
  ) {}

  start() {
    this.ensurePeer();
    this.hb = setInterval(() => this.heartbeat(), 4000);
    document.addEventListener('visibilitychange', this.onVisible);
    window.addEventListener('online', this.onVisible);
  }

  stop() {
    this.stopped = true;
    if (this.hb) clearInterval(this.hb);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    document.removeEventListener('visibilitychange', this.onVisible);
    window.removeEventListener('online', this.onVisible);
    this.conn?.close();
    this.peer?.destroy();
  }

  private onVisible = () => {
    if (document.visibilityState === 'visible' && !this.stopped && !this.conn?.open) this.retry(0);
  };

  private setState(s: PlayerNetState) {
    if (this.state === s) return;
    this.state = s;
    this.h.onState(s);
  }

  private ensurePeer() {
    if (this.stopped) return;
    if (this.peer && !this.peer.destroyed) {
      if (this.peer.open) this.connect();
      else if (this.peer.disconnected) this.peer.reconnect();
      return;
    }
    const peer = new Peer(peerOptions(this.signaling));
    this.peer = peer;
    peer.on('open', () => this.connect());
    peer.on('disconnected', () => {
      if (!this.stopped && !peer.destroyed) setTimeout(() => !peer.destroyed && peer.disconnected && peer.reconnect(), 1500);
    });
    peer.on('error', (e: { type?: string }) => {
      if (this.stopped) return;
      const type = e?.type ?? '';
      if (type === 'peer-unavailable') {
        this.notFoundCount++;
        this.setState(this.notFoundCount >= 2 ? 'notfound' : 'reconnecting');
        this.retry(4000);
      } else if (type === 'browser-incompatible') {
        this.setState('error');
        this.h.onError('Este navegador no soporta WebRTC. Prueba con Chrome, Edge, Safari o Firefox actualizados.');
      } else {
        this.setState('reconnecting');
        if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') {
          peer.destroy();
        }
        this.retry();
      }
    });
  }

  private retry(delay?: number) {
    if (this.stopped) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.attempts++;
    const wait = delay ?? Math.min(8000, 800 * this.attempts);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.ensurePeer();
    }, wait);
  }

  private connect() {
    if (this.stopped || !this.peer) return;
    this.conn?.close();
    const conn = this.peer.connect(PEER_PREFIX + this.code, { reliable: true, serialization: 'json' });
    this.conn = conn;
    if (this.state !== 'notfound') this.setState(this.attempts ? 'reconnecting' : 'connecting');
    const timeout = setTimeout(() => {
      if (!conn.open && this.conn === conn) {
        conn.close();
        this.retry();
      }
    }, 12000);
    conn.on('open', () => {
      clearTimeout(timeout);
      this.attempts = 0;
      this.notFoundCount = 0;
      this.lastMsg = Date.now();
      this.send({ t: 'join', ...this.joinInfo() });
    });
    conn.on('data', (raw) => this.onData(raw as ToPlayer));
    const lost = () => {
      clearTimeout(timeout);
      if (this.conn !== conn || this.stopped || this.state === 'kicked') return;
      this.setState('reconnecting');
      this.retry();
    };
    conn.on('close', lost);
    conn.on('error', lost);
  }

  private send(msg: ToHost) {
    try {
      if (this.conn?.open) void this.conn.send(msg);
    } catch (err) {
      console.warn('[ixchel/net] no se pudo enviar', err);
    }
  }

  private onData(msg: ToPlayer) {
    if (!msg || typeof msg !== 'object') return;
    this.lastMsg = Date.now();
    switch (msg.t) {
      case 'joined':
        this.setState('connected');
        this.h.onJoined(msg);
        break;
      case 'view':
        if (this.state !== 'connected') this.setState('connected');
        this.h.onView(msg.view);
        break;
      case 'ack': {
        const done = this.pending.get(msg.rid);
        if (done) {
          this.pending.delete(msg.rid);
          done({ ok: msg.ok, error: msg.error });
        }
        break;
      }
      case 'error':
        this.setState('error');
        this.h.onError(msg.error);
        break;
      case 'kicked':
        this.setState('kicked');
        this.stop();
        break;
      case 'world':
        if (msg.world && typeof msg.world === 'object') {
          this.world = msg.world;
          this.onWorld?.(msg.world);
        }
        break;
      case 'peers': {
        if (!msg.peers || typeof msg.peers !== 'object') break;
        const clean: PresenceMap = {};
        for (const [id, p] of Object.entries(msg.peers)) if (isPose(p)) clean[id] = p;
        this.onPeers?.(clean);
        break;
      }
    }
  }

  /** Pose del astronauta en el mundo 3D (null al salir). Sin confirmación. */
  sendPose(p: PresencePose | null) {
    this.send({ t: 'pos', p });
  }

  act(action: PlayerAction): Promise<Ack> {
    if (!this.conn?.open) return Promise.resolve({ ok: false, error: 'Sin conexión con la colonia… reintentando.' });
    const rid = this.nextRid++;
    this.send({ t: 'act', rid, action });
    return new Promise((resolve) => {
      this.pending.set(rid, resolve);
      setTimeout(() => {
        if (this.pending.has(rid)) {
          this.pending.delete(rid);
          resolve({ ok: false, error: 'La colonia tardó en responder.' });
        }
      }, 8000);
    });
  }

  /** Toques del minijuego: se envían en lotes y sin confirmación. */
  sendTaps(count: number) {
    if (count > 0) this.send({ t: 'act', rid: 0, action: { type: 'taps', count } });
  }

  /** Reintentar el ingreso con nuevos datos (por ejemplo, después de un nombre rechazado). */
  rejoin() {
    if (this.conn?.open) this.send({ t: 'join', ...this.joinInfo() });
    else this.retry(0);
  }

  private heartbeat() {
    if (this.stopped) return;
    if (this.conn?.open) this.send({ t: 'hb' });
    if (this.state === 'connected' && Date.now() - this.lastMsg > 15000) {
      this.conn?.close();
      this.setState('reconnecting');
      this.retry(0);
    }
  }
}
