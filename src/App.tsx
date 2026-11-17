import { lazy, Suspense } from 'react';
import { useRoute } from './lib/route';
import { Landing } from './pages/Landing';
import { IXOrb } from './components/art';

const HostApp = lazy(() => import('./pages/host/HostApp').then((m) => ({ default: m.HostApp })));
const PlayApp = lazy(() => import('./pages/play/PlayApp').then((m) => ({ default: m.PlayApp })));
const WorldExplorer = lazy(() => import('./world/react/WorldExplorer').then((m) => ({ default: m.WorldExplorer })));
const MinigameLab = lazy(() => import('./pages/play/MinigameLab').then((m) => ({ default: m.MinigameLab })));
const RoverSetup = lazy(() => import('./pages/rover/RoverSetup').then((m) => ({ default: m.RoverSetup })));
const Trainer = lazy(() => import('./pages/trainer/Trainer').then((m) => ({ default: m.Trainer })));
/** Don Rover flotante en todas las secciones (se carga aparte para no frenar la portada). */
const RoverDock = lazy(() => import('./rover/RoverDock').then((m) => ({ default: m.RoverDock })));
const Pitch = lazy(() => import('./pages/pitch/Pitch').then((m) => ({ default: m.Pitch })));
const FreePlay = lazy(() => import('./pages/free/FreePlay').then((m) => ({ default: m.FreePlay })));

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
  // En la presentación Don Rover ya está en el escenario: sin la burbuja flotante.
  const isPitch = route.path === '/pitch' || route.path === '/presentacion';
  return (
    <>
    {!isPitch && (
      <Suspense fallback={null}>
        <RoverDock />
      </Suspense>
    )}
    <Suspense fallback={<Loading />}>
      {isPitch ? (
        <Pitch />
      ) : route.path === '/profe' ? (
        <HostApp />
      ) : route.path === '/jugar' ? (
        <PlayApp initialCode={(route.params.get('c') ?? '').toUpperCase()} sig={route.params.get('s')} />
      ) : route.path === '/donrover' ? (
        <RoverSetup />
      ) : route.path === '/entrenador' ? (
        <Trainer />
      ) : route.path === '/libre' ? (
        <FreePlay initialRoom={(route.params.get('sala') ?? '').toUpperCase()} mode={route.params.get('modo')} />
      ) : route.path === '/mundo' ? (
        <WorldExplorer />
      ) : route.path === '/minijuegos' ? (
        <MinigameLab />
      ) : (
        <Landing />
      )}
    </Suspense>
    </>
  );
}
