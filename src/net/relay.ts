// Canal de respaldo entre el proyector y los celulares: Supabase Realtime (broadcast).
//
// La conexión normal es directa (WebRTC por PeerJS). En muchas redes reales no se puede:
// datos móviles, Wi-Fi escolar con aislamiento de clientes o NAT simétrico, y ya no existen
// servidores TURN públicos que hagan de puente. En esos casos los mensajes del juego viajan
// por un canal de Supabase Realtime, que funciona en cualquier red con acceso a internet.
//
//   · Sala:        "donrover-<CÓDIGO>"       → los celulares avisan que llegaron ("hello").
//   · Por celular: "donrover-<CÓDIGO>-<id>"  → solo ese celular y el proyector: "h" sube al
//                                              proyector y "p" baja al celular.
//
// Un canal por celular evita que cada teléfono reciba los mensajes de todos los demás.

import type { RealtimeChannel, RealtimeClient } from '@supabase/realtime-js';
import type { ToHost, ToPlayer } from './protocol';

export interface RelayConfig {
  url: string;
  key: string;
}

type RelayDown = ToPlayer | { t: 'welcome' } | { t: 'bye' };
type RelayUp = ToHost | { t: 'bye' };

let configPromise: Promise<RelayConfig | null> | null = null;

/** Configuración del respaldo (la entrega /api/realtime del despliegue; null si no hay). */
export function relayConfig(): Promise<RelayConfig | null> {
  if (configPromise) return configPromise;
  configPromise = (async () => {
    const env = import.meta.env as Record<string, string | undefined>;
    if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY) return { url: env.VITE_SUPABASE_URL, key: env.VITE_SUPABASE_ANON_KEY };
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(new URL('api/realtime', document.baseURI).toString(), { cache: 'no-store' });
        if ((res.headers.get('content-type') ?? '').includes('application/json')) {
          const data = (await res.json()) as { enabled?: boolean; url?: string; key?: string };
          return data.enabled && data.url && data.key ? { url: data.url, key: data.key } : null;
        }
        return null;
      } catch {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
    return null;
  })();
  // Si falló por la red, se vuelve a preguntar más adelante.
  void configPromise.then((c) => {
    if (!c) setTimeout(() => (configPromise = null), 20000);
  });
  return configPromise;
}

async function openClient(cfg: RelayConfig): Promise<RealtimeClient> {
  const { RealtimeClient } = await import('@supabase/realtime-js');
  const endpoint = `${cfg.url.replace(/^http/, 'ws')}/realtime/v1`;
  const client = new RealtimeClient(endpoint, { params: { apikey: cfg.key }, heartbeatIntervalMs: 15000 });
  client.connect();
  return client;
}

const roomTopic = (code: string) => `donrover-${code}`;
const playerTopic = (code: string, id: string) => `donrover-${code}-${id}`;

function channel(client: RealtimeClient, topic: string): RealtimeChannel {
  return client.channel(topic, { config: { broadcast: { self: false, ack: false } } });
}

/* ------------------------------------------------------------------ */
/* Lado del proyector                                                   */
/* ------------------------------------------------------------------ */

/** Conexión con un celular, sea directa o por el respaldo. */
export interface Link {
  readonly id: string;
  readonly via: 'p2p' | 'relay';
  readonly open: boolean;
  send(msg: ToPlayer): void;
  close(): void;
}

class RelayLink implements Link {
  readonly via = 'relay' as const;
  private ready = false;
  private closed = false;
  private queue: RelayDown[] = [];

  constructor(
    readonly id: string,
    private readonly ch: RealtimeChannel,
    private readonly onClose: (link: RelayLink) => void,
  ) {}

  get open(): boolean {
    return this.ready && !this.closed;
  }

  markReady(): void {
    this.ready = true;
    for (const m of this.queue.splice(0)) this.push(m);
  }

  push(m: RelayDown): void {
    if (this.closed) return;
    if (!this.ready) {
      this.queue.push(m);
      return;
    }
    void this.ch.send({ type: 'broadcast', event: 'p', payload: m });
  }

  send(msg: ToPlayer): void {
    this.push(msg);
  }

  close(): void {
    if (this.closed) return;
    if (this.ready) void this.ch.send({ type: 'broadcast', event: 'p', payload: { t: 'bye' } });
    this.closed = true;
    this.onClose(this);
  }

  dispose(): void {
    this.closed = true;
    void this.ch.unsubscribe();
  }
}

export interface RelayHostHandlers {
  onOpen(link: Link): void;
  onMessage(link: Link, msg: ToHost): void;
  onClose(link: Link): void;
}

export class RelayHost {
  private client: RealtimeClient | null = null;
  private room: RealtimeChannel | null = null;
  private readonly links = new Map<string, RelayLink>();
  private stopped = false;
  /** El canal de la sala está escuchando. */
  active = false;

  constructor(
    private readonly code: string,
    private readonly h: RelayHostHandlers,
    private readonly onActive: (active: boolean) => void,
  ) {}

  async start(): Promise<boolean> {
    const cfg = await relayConfig();
    if (!cfg || this.stopped) return false;
    try {
      this.client = await openClient(cfg);
    } catch (err) {
      console.warn('[don-rover/relay] no se pudo abrir el respaldo', err);
      return false;
    }
    if (this.stopped) {
      void this.client.disconnect();
      return false;
    }
    const room = channel(this.client, roomTopic(this.code));
    this.room = room;
    room.on('broadcast', { event: 'hello' }, ({ payload }) => {
      const from = typeof payload?.from === 'string' ? payload.from.slice(0, 40) : '';
      if (/^[a-z0-9]{6,40}$/.test(from)) this.welcome(from);
    });
    room.subscribe((status) => {
      const on = status === 'SUBSCRIBED';
      if (on !== this.active) {
        this.active = on;
        this.onActive(on);
      }
    });
    return true;
  }

  /** Un celular avisa que llegó por el respaldo: se abre (o se reaprovecha) su canal. */
  private welcome(from: string): void {
    const existing = this.links.get(from);
    if (existing && existing.open) {
      existing.push({ t: 'welcome' });
      return;
    }
    existing?.dispose();
    if (!this.client) return;
    const ch = channel(this.client, playerTopic(this.code, from));
    const link = new RelayLink(from, ch, (l) => this.drop(l));
    this.links.set(from, link);
    ch.on('broadcast', { event: 'h' }, ({ payload }) => {
      if (this.links.get(from) !== link || !payload || typeof payload !== 'object') return;
      const msg = payload as RelayUp;
      if (msg.t === 'bye') {
        this.drop(link);
        return;
      }
      this.h.onMessage(link, msg);
    });
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED' && this.links.get(from) === link && !link.open) {
        link.markReady();
        link.push({ t: 'welcome' });
        this.h.onOpen(link);
      }
    });
  }

  private drop(link: RelayLink): void {
    if (this.links.get(link.id) !== link) return;
    this.links.delete(link.id);
    link.dispose();
    this.h.onClose(link);
  }

  stop(): void {
    this.stopped = true;
    for (const l of this.links.values()) l.dispose();
    this.links.clear();
    void this.room?.unsubscribe();
    void this.client?.disconnect();
    this.active = false;
  }
}

/* ------------------------------------------------------------------ */
/* Lado del celular                                                     */
/* ------------------------------------------------------------------ */

export interface RelayPlayerHandlers {
  onOpen(): void;
  onMessage(msg: ToPlayer): void;
  onClose(): void;
}

export class RelayPlayer {
  readonly id = Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
  private client: RealtimeClient | null = null;
  private room: RealtimeChannel | null = null;
  private mine: RealtimeChannel | null = null;
  private helloTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  open = false;

  constructor(
    private readonly code: string,
    private readonly h: RelayPlayerHandlers,
  ) {}

  /** Devuelve false si este despliegue no tiene respaldo configurado. */
  async start(): Promise<boolean> {
    const cfg = await relayConfig();
    if (!cfg || this.stopped) return false;
    try {
      this.client = await openClient(cfg);
    } catch (err) {
      console.warn('[don-rover/relay] no se pudo abrir el respaldo', err);
      return false;
    }
    if (this.stopped) {
      void this.client.disconnect();
      return false;
    }
    const mine = channel(this.client, playerTopic(this.code, this.id));
    this.mine = mine;
    mine.on('broadcast', { event: 'p' }, ({ payload }) => {
      if (!payload || typeof payload !== 'object') return;
      const msg = payload as RelayDown;
      if (msg.t === 'welcome') {
        if (!this.open) {
          this.open = true;
          this.stopHello();
          this.h.onOpen();
        }
        return;
      }
      if (msg.t === 'bye') {
        this.lost();
        return;
      }
      this.h.onMessage(msg);
    });
    const room = channel(this.client, roomTopic(this.code));
    this.room = room;
    let subscribed = 0;
    const ready = (status: string) => {
      if (status === 'SUBSCRIBED' && ++subscribed === 2) this.startHello();
    };
    mine.subscribe(ready);
    room.subscribe(ready);
    return true;
  }

  private startHello(): void {
    this.stopHello();
    const hello = () => {
      if (!this.stopped && !this.open) void this.room?.send({ type: 'broadcast', event: 'hello', payload: { from: this.id } });
    };
    hello();
    this.helloTimer = setInterval(hello, 2500);
  }

  private stopHello(): void {
    if (this.helloTimer) clearInterval(this.helloTimer);
    this.helloTimer = null;
  }

  /** El proyector dejó de responder: se vuelve a anunciar hasta que conteste. */
  lost(): void {
    if (!this.open) return;
    this.open = false;
    this.h.onClose();
    if (!this.stopped) this.startHello();
  }

  send(msg: ToHost): void {
    if (this.open) void this.mine?.send({ type: 'broadcast', event: 'h', payload: msg });
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.stopHello();
    if (this.open) void this.mine?.send({ type: 'broadcast', event: 'h', payload: { t: 'bye' } });
    this.open = false;
    void this.mine?.unsubscribe();
    void this.room?.unsubscribe();
    setTimeout(() => void this.client?.disconnect(), 300);
  }
}
