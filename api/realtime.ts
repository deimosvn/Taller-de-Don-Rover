// Función de Vercel: datos públicos para el canal de respaldo (Supabase Realtime).
//
// Los celulares se conectan con el proyector directamente (WebRTC). Cuando la red no lo
// permite —datos móviles, Wi-Fi escolar con aislamiento de clientes, NAT simétrico— el juego
// usa un canal de "broadcast" de Supabase Realtime como respaldo. Para abrirlo el navegador
// necesita la URL del proyecto y la clave pública (anon / publishable). Esa clave está pensada
// para el navegador: no da acceso a las tablas (tienen RLS sin políticas), solo a los canales.
//
// La integración de Supabase en Vercel crea estas variables; se acepta cualquiera de los nombres.
//
//   GET /api/realtime → { ok, enabled, url?, key? }

interface Req {
  method?: string;
}
interface Res {
  status(code: number): Res;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
}

function first(...names: string[]): string {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v.trim();
  }
  return '';
}

/** Si solo hay cadena de conexión de Postgres, deduce la URL del proyecto de Supabase. */
function urlFromPostgres(): string {
  const raw = first('POSTGRES_URL', 'POSTGRES_URL_NON_POOLING', 'SUPABASE_DB_URL', 'DATABASE_URL');
  if (!raw) return '';
  try {
    const u = new URL(raw);
    // Pooler: usuario "postgres.<ref>" · conexión directa: host "db.<ref>.supabase.co".
    const ref = /^postgres\.([a-z0-9]+)$/.exec(decodeURIComponent(u.username))?.[1] ?? /^db\.([a-z0-9]+)\.supabase\.co$/.exec(u.hostname)?.[1];
    return ref ? `https://${ref}.supabase.co` : '';
  } catch {
    return '';
  }
}

export default function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method && req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Método no permitido.' });
    return;
  }
  const url = first('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'VITE_SUPABASE_URL') || urlFromPostgres();
  const key = first(
    'SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'VITE_SUPABASE_ANON_KEY',
  );
  if (!url || !key) {
    res.status(200).json({ ok: true, enabled: false, missing: [!url && 'SUPABASE_URL', !key && 'SUPABASE_ANON_KEY'].filter(Boolean) });
    return;
  }
  res.status(200).json({ ok: true, enabled: true, url: url.replace(/\/+$/, ''), key });
}
