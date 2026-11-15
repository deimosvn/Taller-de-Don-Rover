import { lazy, Suspense } from 'react';
import { useRoute } from './lib/route';
import { Landing } from './pages/Landing';
import { IXOrb } from './components/art';

const HostApp = lazy(() => import('./pages/host/HostApp').then((m) => ({ default: m.HostApp })));
const PlayApp = lazy(() => import('./pages/play/PlayApp').then((m) => ({ default: m.PlayApp })));
const WorldExplorer = lazy(() => import('./world/react/WorldExplorer').then((m) => ({ default: m.WorldExplorer })));

function Loading() {
  return (
    <div className="boot space-bg">
      <div className="starfield" />
      <IXOrb size={120} mood="talk" />
      <p className="eyebrow">Encendiendo sistemas…</p>
    </div>
  );
}

export function App() {
  const route = useRoute();
  return (
    <Suspense fallback={<Loading />}>
      {route.path === '/profe' ? (
        <HostApp />
      ) : route.path === '/jugar' ? (
        <PlayApp initialCode={(route.params.get('c') ?? '').toUpperCase()} sig={route.params.get('s')} />
      ) : route.path === '/mundo' ? (
        <WorldExplorer />
      ) : (
        <Landing />
      )}
    </Suspense>
  );
}
