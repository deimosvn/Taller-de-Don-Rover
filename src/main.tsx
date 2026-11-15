import { createRoot } from 'react-dom/client';
import '@fontsource-variable/fredoka';
import '@fontsource-variable/nunito';
import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import './styles/global.css';
import './styles/landing.css';
import './styles/host.css';
import './styles/play.css';
import './styles/world.css';
import './styles/nasa.css';
import './styles/minigames.css';
import { App } from './App';
import { probeServer } from './lib/cloud';
import { registerServiceWorker } from './lib/pwa';

registerServiceWorker();
// ¿El despliegue tiene base de datos (Supabase) e IA de servidor (Claude)? Se consulta una vez.
void probeServer();

createRoot(document.getElementById('root')!).render(<App />);
