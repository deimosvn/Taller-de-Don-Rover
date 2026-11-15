// Emisor de eventos tipado, mínimo. El mundo 3D avisa por aquí a la interfaz y, más adelante,
// a la lógica de misiones (selección, zonas, interacciones…).

export class Emitter<E extends object> {
  private readonly handlers = new Map<keyof E, Set<(payload: never) => void>>();

  /** Suscribe un manejador y devuelve la función para cancelarlo. */
  on<K extends keyof E>(type: K, handler: (payload: E[K]) => void): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as (payload: never) => void);
    return () => set!.delete(handler as (payload: never) => void);
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const h of [...set]) (h as (payload: E[K]) => void)(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}
