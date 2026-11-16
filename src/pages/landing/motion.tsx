// Movimiento de la portada: los bloques aparecen al llegar a ellos, la barra de arriba
// muestra cuánto falta por leer, el fondo se mueve un poco con el scroll y los números
// cuentan hacia arriba. Quien pide menos movimiento en su sistema lo ve todo quieto.

import { createElement, useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';

/* ---------------- ¿ya se ve? ---------------- */

type Callback = () => void;
let observer: IntersectionObserver | null = null;
const waiting = new Map<Element, Callback>();

function watch(el: Element, cb: Callback): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    cb();
    return () => {};
  }
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        waiting.get(e.target)?.();
        waiting.delete(e.target);
        observer?.unobserve(e.target);
      }
    },
    // Aparece un poco antes de llegar al centro, cuando ya se asomó una parte.
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  );
  waiting.set(el, cb);
  observer.observe(el);
  return () => {
    waiting.delete(el);
    observer?.unobserve(el);
  };
}

export const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/** true desde la primera vez que el elemento entra a la pantalla. */
export function useInView<T extends Element>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    return watch(el, () => setSeen(true));
  }, [seen]);
  return [ref, seen];
}

/* ---------------- aparecer ---------------- */

type Variant = 'up' | 'left' | 'right' | 'scale' | 'fade' | 'blur';
type Tag = 'div' | 'section' | 'article' | 'header' | 'li' | 'p' | 'figure' | 'span' | 'ul' | 'ol' | 'aside';

/** Un bloque que aparece (con un pequeño retraso opcional) cuando llega a la pantalla. */
export function Reveal({
  as = 'div',
  variant = 'up',
  delay = 0,
  className = '',
  style,
  children,
  id,
}: {
  as?: Tag;
  variant?: Variant;
  /** Milisegundos de espera: sirve para que una lista aparezca uno tras otro. */
  delay?: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  id?: string;
}) {
  const [ref, seen] = useInView<HTMLElement>();
  return createElement(
    as,
    {
      ref,
      id,
      className: `rv rv-${variant} ${seen ? 'is-in' : ''} ${className}`,
      style: { ...style, '--d': `${delay}ms` } as CSSProperties,
    },
    children,
  );
}

/* ---------------- números que cuentan ---------------- */

export function CountUp({ to, ms = 1400, decimals = 0 }: { to: number; ms?: number; decimals?: number }) {
  const [ref, seen] = useInView<HTMLSpanElement>();
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!seen) return;
    if (prefersReducedMotion()) {
      setV(to);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      // Arranca rápido y frena al final.
      setV(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [seen, to, ms]);
  return <span ref={ref}>{v.toLocaleString('es-MX', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</span>;
}

/* ---------------- scroll de toda la página ---------------- */

/**
 * Pone en el elemento raíz `--lp-scroll` (px recorridos) y `--lp-progress` (0–1) en cada cuadro
 * que hay scroll, y avisa cuando la página ya bajó (para darle fondo a la barra de arriba).
 */
export function useScrollFx(root: RefObject<HTMLElement | null>): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let raf = 0;
    let last = -1;
    const update = () => {
      raf = 0;
      const y = window.scrollY;
      if (y === last) return;
      last = y;
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      el.style.setProperty('--lp-scroll', String(Math.round(y)));
      el.style.setProperty('--lp-progress', (y / max).toFixed(4));
      setScrolled(y > 12);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [root]);
  return scrolled;
}

/** Baja suavemente hasta una sección sin tocar el hash (el hash es la ruta de la app). */
export function scrollToId(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  // Para teclado y lectores de pantalla: el foco llega a la sección.
  el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
}
