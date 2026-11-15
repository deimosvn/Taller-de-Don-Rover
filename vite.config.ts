import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

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
  plugins: [react(), pwaServiceWorker()],
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
