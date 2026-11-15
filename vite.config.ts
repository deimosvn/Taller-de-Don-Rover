import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * En desarrollo (`npm run dev`) las funciones de la carpeta api/ corren igual que en Vercel:
 * /api/nasa, /api/ai y /api/colonies. Las claves se leen de .env.local (nunca se suben).
 */
function devApi(): Plugin {
  return {
    name: 'don-rover-dev-api',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '');
      for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v;
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const match = /^\/api\/([a-z]+)$/.exec(url.pathname);
        if (!match) return next();
        try {
          const mod = (await server.ssrLoadModule(`/api/${match[1]}.ts`)) as { default?: (req: unknown, res: unknown) => Promise<void> };
          if (!mod.default) return next();
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const raw = Buffer.concat(chunks).toString('utf8');
          const body = raw && (req.headers['content-type'] ?? '').includes('application/json') ? JSON.parse(raw) : raw;
          const vreq = Object.assign(req, { query: Object.fromEntries(url.searchParams), body });
          const vres = Object.assign(res, {
            status(code: number) {
              res.statusCode = code;
              return vres;
            },
            json(data: unknown) {
              res.setHeader('content-type', 'application/json; charset=utf-8');
              res.end(JSON.stringify(data));
            },
          });
          await mod.default(vreq, vres);
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ ok: false, error: String((err as Error).message ?? err) }));
        }
      });
    },
  };
}

/**
 * Genera el service worker de la PWA con la lista exacta de archivos del build
 * (nombres con hash), para que la app completa funcione sin conexión desde la
 * primera visita. Solo se ejecuta en `vite build`.
 */
function pwaServiceWorker(): Plugin {
  return {
    name: 'ixchel-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter((f) => {
        if (f.endsWith('.map')) return false;
        // De las fuentes solo precargamos los subconjuntos latinos (español).
        if (f.endsWith('.woff2') || f.endsWith('.woff')) return /-latin-(?!ext)/.test(f);
        return true;
      });
      const shell = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
      const precache = [...shell, ...files.map((f) => `./${f}`)];
      const version = `ixchel-${Date.now().toString(36)}`;
      const template = readFileSync(new URL('./pwa/sw.js', import.meta.url), 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(precache)),
      });
    },
  };
}

/**
 * Dominio público de producción. En Vercel llega como variable del sistema al compilar; con
 * él, el QR nunca apunta a una URL de despliegue protegida (que pide iniciar sesión).
 */
const publicHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VITE_VERCEL_PROJECT_PRODUCTION_URL || '';

export default defineConfig({
  base: './',
  plugins: [react(), pwaServiceWorker(), devApi()],
  define: {
    'import.meta.env.VITE_PUBLIC_HOST': JSON.stringify(publicHost),
  },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 3000,
  },
});
