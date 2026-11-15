# Taller de Don Rover

**Un salón. Una tripulación. Una colonia en Marte por salvar.**

El Taller de Don Rover es una plataforma de aprendizaje multijugador construida alrededor de la IA. Convierte un salón de clases en una colonia en Marte que tiene que sobrevivir. Cada partida es una tripulación de cuatro alumnos, uno por especialidad. **IX**, la IA de la colonia, arma cada misión con datos reales de la NASA (clima espacial y estudios científicos). Cada especialidad tiene una pieza de información que las demás no tienen, así que la tripulación solo encuentra la mejor decisión si coopera. Lo que decide cambia un planeta 3D que se guarda de una clase a otra.

Es una **PWA que corre en el navegador**. El navegador del profesor (la pantalla del proyector) es el anfitrión y la única fuente de verdad del juego. Los celulares de los alumnos se conectan directo por **WebRTC** escaneando un QR. Las funciones de servidor (IA, base de datos, NASA) son **opcionales**: si faltan, el juego sigue funcionando con su motor y su contenido propio.

- **Producción:** <https://tallerdedonrover.vercel.app> (cada push a `main` se publica en Vercel)
- **Idioma:** español de México · público de 7 a 15 años

---

## Índice

1. [Qué incluye](#qué-incluye)
2. [Stack tecnológico](#stack-tecnológico)
3. [Arquitectura](#arquitectura)
4. [Rutas de la app](#rutas-de-la-app)
5. [Flujo de una misión](#flujo-de-una-misión)
6. [Motor del juego](#motor-del-juego)
7. [Red: proyector ↔ celulares](#red-proyector--celulares)
8. [Inteligencia artificial (Claude)](#inteligencia-artificial-claude)
9. [Datos reales de la NASA](#datos-reales-de-la-nasa)
10. [API del servidor (`api/`)](#api-del-servidor-api)
11. [Base de datos (Supabase)](#base-de-datos-supabase)
12. [Mundo 3D (Three.js)](#mundo-3d-threejs)
13. [Modo libre](#modo-libre)
    · [Don Rover: asistente de voz y placa con pantalla](#don-rover-asistente-de-voz-y-placa-con-pantalla)
14. [Minijuegos](#minijuegos)
15. [PWA y modo sin conexión](#pwa-y-modo-sin-conexión)
16. [Almacenamiento local](#almacenamiento-local)
17. [Instalación y desarrollo](#instalación-y-desarrollo)
18. [Variables de entorno](#variables-de-entorno)
19. [Despliegue](#despliegue)
20. [Estructura del repositorio](#estructura-del-repositorio)
21. [Seguridad y privacidad](#seguridad-y-privacidad)
22. [Una clase de 40 minutos](#una-clase-de-40-minutos)
23. [Notas](#notas)

---

## Qué incluye

| Parte | Ruta | Descripción |
| --- | --- | --- |
| Presentación | `#/` | Portada del proyecto con el planeta, los personajes y las misiones en 3D. |
| Consola del profesor | `#/profe` | Abordaje con QR, formación de la tripulación, generación de la misión por IX, briefing, descubrimiento, reto, evento global, resultados y debrief. Incluye bitácora de IX, pistas, pausa, tiempo extra, bots de práctica, estado de la colonia y reporte en CSV. |
| App del alumno | `#/jugar?c=CODE` | Astronauta personalizable, tarea de su especialidad en el mundo 3D, transmisión secreta, votación, bitácora, minijuegos de la emergencia, XP e insignias guardados en el dispositivo. |
| Modo libre | `#/libre` | Sin código de clase: explorar Marte, recolectar recursos y construir módulos de la colonia, solo o con amigos por enlace o QR. |
| Explorador del mundo | `#/mundo` | El planeta 3D por sí solo, para recorrerlo libremente. |
| Laboratorio de minijuegos | `#/minijuegos` | Todos los minijuegos para probarlos sin una partida. |
| Entrenador de misión | `#/entrenador` | Retos personalizados con IA y física real de Marte: energía, oxígeno, agua, invernadero, blindaje y aterrizaje. |
| Don Rover físico | `#/donrover` | Asistente de voz con una placa de pantalla redonda (BIGTREETECH KNOMI): instalar el firmware, conectarla y probarla. |

**Seis misiones:** M-01 *Greenhouse Rescue*, M-02 *The Water Crisis*, M-03 *Darkness Protocol*, M-04 *The Unknown Signal*, M-05 *Habitat Zero* y M-06 *The Final Colony*.

**Cuatro especialidades** (una por alumno), conectadas como los sistemas de una base real:

```
🛡️ Hábitat ──protege──▶ ⚡ Energía ──alimenta──▶ 💧 Soporte vital ──riega──▶ 🌱 Astrobiología
   ▲                                                                              │
   └──────────────────── la comida fresca refuerza a la tripulación ─────────────┘
```

| Rol (`RoleId`) | Especialidad | Sistema de la colonia (`SystemId`) |
| --- | --- | --- |
| `power` | ⚡ Energía | `energy` |
| `life` | 💧 Soporte vital | `water` (agua y oxígeno) |
| `bio` | 🌱 Astrobiología | `food` |
| `habitat` | 🛡️ Hábitat | `habitat` |

---

## Stack tecnológico

### Lenguajes

| Lenguaje | Uso |
| --- | --- |
| **TypeScript** (modo `strict`, ES2022) | Todo el código del cliente (`src/`), el contenido compartido (`shared/`) y las funciones serverless (`api/`). |
| **TSX / JSX** | Componentes de React. |
| **GLSL** | Shaders del terreno y del postproceso, inyectados en materiales de Three.js (`src/world/planet/terrainMaterial.ts`, `src/world/fx/PostFX.ts`). |
| **CSS** | Hojas propias por área (`src/styles/*.css`), con variables CSS. No hay framework de estilos. |
| **SQL** (PostgreSQL) | Esquema de Supabase (`supabase/schema.sql`). |
| **JavaScript** (ESM) | Plantilla del service worker (`pwa/sw.js`) y script de íconos (`scripts/make-icons.mjs`). |

### Dependencias de producción

| Paquete | Versión | Para qué |
| --- | --- | --- |
| `react`, `react-dom` | ^19.3.1 | Interfaz. |
| `three` | ^0.187.0 | Motor 3D del planeta, la colonia, los astronautas y los retratos. |
| `peerjs` | ^1.5.5 | WebRTC (canales de datos) entre el proyector y los celulares, y entre amigos en el modo libre. |
| `@supabase/realtime-js` | ^2.118.0 | Canal de respaldo (broadcast) cuando WebRTC no puede conectar. |
| `@anthropic-ai/sdk` | ^1.8.0 | Claude en el servidor (`api/ai.ts`) y, como alternativa, en el navegador. |
| `postgres` | ^3.4.9 | Driver de Postgres para Supabase en `api/colonies.ts`. |
| `qrcode` | ^1.5.4 | QR de abordaje y de las salas del modo libre. |
| `@fontsource-variable/fredoka`, `@fontsource-variable/nunito`, `@fontsource/space-mono` | ^5.3.0 | Tipografías locales, para que funcionen sin conexión. |

### Dependencias de desarrollo

`vite` ^8.3.8 · `@vitejs/plugin-react` ^6.3.0 · `typescript` ^7.0.2 · `@types/*` (node, react, react-dom, three, qrcode) · `@resvg/resvg-js` ^2.6.2 (rasteriza el SVG de los íconos de la PWA).

### Servicios externos (todos opcionales)

| Servicio | Uso |
| --- | --- |
| **Vercel** | Hosting estático y funciones serverless (`api/*.ts`). |
| **Anthropic Claude API**, modelo `claude-opus-5-5` | Genera la misión, la narrativa, la evaluación de bitácoras y el debrief. |
| **Supabase** (Postgres + Realtime) | Colonias en la nube con historial de misiones, y canal de respaldo para la red. |
| **NASA**: DONKI (`api.nasa.gov`), NTRS (`ntrs.nasa.gov`), OSDR (`osdr.nasa.gov`) | Clima espacial y estudios científicos reales. |
| **PeerJS Cloud** (o un PeerServer propio) | Solo la señalización inicial de WebRTC. |
| **STUN**: Cloudflare y Google | Descubrir la ruta de red entre dispositivos. |

---

## Arquitectura

```
                         ┌───────────────────────── Vercel ─────────────────────────┐
                         │  dist/ (app estática)    api/ai.ts ──▶ Anthropic Claude  │
                         │                          api/nasa.ts ──▶ NASA DONKI/NTRS/OSDR
                         │                          api/colonies.ts ──▶ Supabase Postgres
                         │                          api/realtime.ts (config pública) │
                         └──────────────▲───────────────────────────────▲───────────┘
                                        │ HTTPS (fetch)                 │
┌──────────────── Proyector (#/profe) ──┴─────────────┐                 │
│  HostEngine (src/engine/room.ts)                    │                 │
│   · única fuente de verdad: fases, puntajes, recursos                 │
│   · tick cada segundo, bots, eventos adaptativos    │                 │
│  HostNet (src/net/hostNet.ts)                       │                 │
│  Mundo 3D (WorldEngine)                             │                 │
└──────▲───────────────────────────────▲──────────────┘                 │
       │ WebRTC DataChannel (DTLS)     │ Supabase Realtime (respaldo)   │
       │ ToHost / ToPlayer (JSON)      │ canal por celular              │
┌──────┴───────── Celular (#/jugar) ───┴──────────────┐                 │
│  PlayerNet: envía acciones, recibe su PlayerView    │─────────────────┘
│  Minijuegos, mundo 3D en 1.ª/3.ª persona            │   (solo /api/nasa y estáticos)
└─────────────────────────────────────────────────────┘
```

Principios de diseño:

- **"La IA narra, el motor decide."** Recursos, puntajes y consecuencias los calcula un motor determinista. Claude solo escribe textos y elige entre opciones válidas, siempre con salidas estructuradas (JSON Schema) que se validan antes de usarse.
- **El proyector es el servidor.** No hay un backend que mantenga la partida. `HostEngine` corre en el navegador del profesor, los celulares solo mandan acciones (`PlayerAction`) y reciben su vista filtrada (`PlayerView`).
- **Todo es opcional y tolerante a fallas.** Sin internet, sin IA, sin base de datos o sin la NASA, el juego cae a plantillas, reglas del motor, contenido propio y `localStorage`.
- **Nadie tiene toda la información.** Los rompecabezas (`shared/puzzles.ts`) reparten un dato imprescindible a cada especialidad. Los números se generan con una semilla por tripulación (`shared/rng.ts`), así que copiar a otro equipo no sirve.

---

## Rutas de la app

El enrutador usa el hash de la URL (`src/lib/route.ts`), así que funciona en cualquier hosting estático y dentro de la PWA instalada sin configurar el servidor. Cada página se carga bajo demanda con `React.lazy` (`src/App.tsx`).

| Ruta | Componente | Parámetros |
| --- | --- | --- |
| `#/` | `pages/Landing.tsx` | — |
| `#/profe` | `pages/host/HostApp.tsx` | — |
| `#/jugar` | `pages/play/PlayApp.tsx` | `c` = código de sala (4 letras) · `s` = servidor de señalización propio (base64) |
| `#/libre` | `pages/free/FreePlay.tsx` | `sala` = código de sala (5 caracteres) · `modo` |
| `#/mundo` | `world/react/WorldExplorer.tsx` | — |
| `#/minijuegos` | `pages/play/MinigameLab.tsx` | — |
| `#/entrenador` | `pages/trainer/Trainer.tsx` | — |
| `#/donrover` | `pages/rover/RoverSetup.tsx` | — |

---

## Flujo de una misión

Las fases (`Phase` en `shared/types.ts`) avanzan en este orden:

| Fase | Etiqueta | Qué pasa |
| --- | --- | --- |
| `lobby` | Abordaje | Los alumnos escanean el QR y arman su astronauta. Máximo **4 jugadores** (`MAX_PLAYERS`). |
| `crews` | Tripulaciones | IX asigna una especialidad a cada quien. |
| `scan` | Escáner | IX genera la misión: consulta el clima espacial (DONKI), revisa la colonia, busca estudios (NTRS/OSDR) y, con Claude, elige la misión y escribe la tarea de cada especialidad. |
| `briefing` | Briefing | Narrativa de la misión y el estudio real de la NASA que la inspira. |
| `discovery` | Descubrimiento | Cada alumno hace la tarea de su especialidad en su estación del mundo 3D y desbloquea su transmisión secreta (quiz). |
| `challenge` | Reto de tripulación | La tripulación combina sus datos, vota una decisión y escribe una bitácora. También resuelven el problema de la historia con minijuegos. |
| `event` | Evento global | Emergencia con tres etapas: compartir recursos, acción (minijuegos por especialidad) y resultado. Se endurece si el Sol está activo de verdad. |
| `results` | Resultados | El motor calcula el nivel de cada decisión (`best` / `ok` / `bad` / `critical`), actualiza los medidores de la colonia y desbloquea edificios. |
| `debrief` | Debrief | IX resume lo aprendido, da reconocimientos y deja una pregunta para conversar. |

**Ritmos** (`PACES` en `shared/content.ts`, en segundos):

| Ritmo | Descubrimiento | Reto | Compartir | Acción |
| --- | --- | --- | --- | --- |
| `class`: clase completa (~40 min) | 300 | 420 | 60 | 35 |
| `demo`: demo rápida (~10 min) | 75 | 150 | 30 | 25 |

**Dificultades** (`DIFFICULTIES`): `explorer` (7 a 9 años, números pequeños y pistas claras) · `cadet` (10 a 12, comparar y sumar datos) · `commander` (12 a 15, multiplicar por sols y razonar con varias condiciones).

---

## Motor del juego

`src/engine/room.ts` define la clase **`HostEngine`**, que corre en el proyector:

- **Estado:** jugadores, tripulación, misión en curso (`MissionRun`), colonia (`ColonyState`: medidores `energy`/`water`/`food`/`habitat`, ocho sectores, edificios, historial), bitácora de IX y reloj de fase.
- **Entradas:**
  - `hostAction(HostAction)`: `addBots`, `formCrews`, `shuffleCrews`, `toScan`, `next`, `pause`, `resume`, `addTime`, `hint`, `kick`, `newMission`, `toLobby`, `setDifficulty`.
  - `playerAction(playerId, PlayerAction)`: `quiz`, `vote`, `log`, `share`, `taps`, `fix`, `task`, `objectVote`, `bonus`, `avatar`.
- **Salidas:** `hostView()` para la consola y `playerView(id)` para cada celular, que solo ve lo suyo.
- **Ciclo:** `tick()` cada segundo avanza los cronómetros, corre los bots (`runBots`) y el **generador adaptativo de eventos** (`adaptive`). Si a la clase le cuesta, IX manda pistas. Si todo es fácil, abre una emergencia bonus. Si alguien participa poco, activa el protocolo de tripulación.
- **Puntaje:** `TIER_SCORE` = best 100 · ok 60 · bad 25 · critical 0. El efecto en la salud de la colonia (`TIER_HEALTH`) va de +12 a −16.
- **Votación:** gana la pluralidad. Si se acaba el tiempo, `forceLockAll` cierra las decisiones pendientes.
- **Moderación:** un filtro de palabras (`looksInappropriate`) más la evaluación de Claude (`appropriate=false`) en las bitácoras y los nombres.
- **Persistencia:** `snapshot()` se guarda en `localStorage` (`ixchel.room`), así que la sala sobrevive a una recarga. `src/engine/session.ts` mantiene motor y red fuera de React, así que navegar dentro de la app no cierra la sala.
- **Colonias:** `src/engine/store.ts` las guarda en el navegador (`ixchel.colonies`), con exportar e importar en JSON. `src/lib/cloud.ts` las sincroniza con Supabase cuando está disponible.
- **Reloj:** `src/lib/clock.ts` sincroniza los cronómetros de los celulares con la hora del proyector.

Contenido y reglas compartidas (`shared/`):

| Archivo | Contenido |
| --- | --- |
| `types.ts` | Tipos entre motor, consola y celulares (`Phase`, `PlayerView`, `HostView`, acciones…). |
| `content.ts` | Roles, sectores, edificios, insignias, avatares, misiones, eventos, plan de clase y datos científicos. |
| `puzzles.ts` | Generadores de rompecabezas cooperativos por misión y dificultad. |
| `roleTasks.ts` | Tareas de cada especialidad con sus dependencias y condiciones reales de la misión. |
| `minigames.ts` | Especificación de los minijuegos y de los problemas de cada misión (`MISSION_PROBLEMS`). |
| `nasa.ts` | Temas de búsqueda por misión, condiciones de salud, dosis de radiación y protección. |
| `rng.ts` | PRNG con semilla (`makeRng`, `hashString`, `shuffle`…). |

---

## Red: proyector ↔ celulares

**Transporte principal: WebRTC con PeerJS** (`src/net/hostNet.ts`, `src/net/playerNet.ts`)

- El proyector abre un peer con el id `ixchel-mars-v1-<CÓDIGO>` (`PEER_PREFIX`). El código de sala tiene 4 letras sin caracteres ambiguos.
- La señalización usa PeerJS Cloud por defecto. Se puede configurar un **PeerServer propio** en *Ajustes → Servidor de señalización propio*. Viaja dentro del QR en el parámetro `s`, codificado en base64.
- ICE: `stun:stun.cloudflare.com:3478`, `stun:stun.l.google.com:19302` y `stun1`. Los TURN que PeerJS trae por defecto ya no existen, así que no se usan.
- El juego viaja cifrado por DTLS, directo entre dispositivos.

**Respaldo: Supabase Realtime** (`src/net/relay.ts`)

- Si el celular no logra conexión directa en **6 s** (`RELAY_AFTER_MS`), por ejemplo con datos móviles, Wi-Fi escolar con aislamiento de clientes o NAT simétrico, pasa a un canal *broadcast* de Supabase y se queda ahí el resto de la sesión.
- Canales: `donrover-<CÓDIGO>` para anunciar la llegada (`hello`) y `donrover-<CÓDIGO>-<id>` para el tráfico de cada celular (`h` sube al proyector, `p` baja al celular).
- La configuración pública (URL y clave anon) se obtiene de `GET /api/realtime`.

**Protocolo** (`src/net/protocol.ts`, mensajes JSON):

```ts
type ToHost =
  | { t: 'join'; name; avatar; xp; token? }      // entrar o reconectar con el token
  | { t: 'act'; rid; action: PlayerAction }      // acción con id para el ack
  | { t: 'hb' }                                  // heartbeat
  | { t: 'pos'; p: PresencePose | null };        // pose en el mundo 3D

type ToPlayer =
  | { t: 'joined'; playerId; token; name }
  | { t: 'error'; error } | { t: 'ack'; rid; ok; error? }
  | { t: 'view'; view: PlayerView }              // vista filtrada del jugador
  | { t: 'kicked' }
  | { t: 'world'; world: WorldSnapshot }         // estado de la colonia para el 3D
  | { t: 'peers'; peers: PresenceMap };          // poses de los compañeros
```

Las poses se validan como vector unitario más rumbo (`isPose`), porque los datos de la red no son de fiar. La presencia se reparte cada 200 ms y caduca a los 8 s. Los celulares se reconectan solos con su token si el teléfono se bloquea, cambia de red o el profesor recarga la página.

---

## Inteligencia artificial (Claude)

Modelo por defecto: **`claude-opus-5-5`**, configurable con `ANTHROPIC_MODEL` o desde *Ajustes*. El orden de preferencia (`src/engine/ai.ts`) es:

1. **IA del servidor** (`/api/ai` con `ANTHROPIC_API_KEY`): la clave nunca llega al navegador y las instrucciones viven en el servidor.
2. **Clave en el navegador**: el profesor la pega en *Ajustes*. Se guarda solo en ese navegador y usa el SDK con `dangerouslyAllowBrowser`. Conviene una clave con límite de gasto.
3. **Sin IA**: las reglas del motor eligen la misión y se usan plantillas revisadas.

Tareas (todas con `output_config.format = json_schema` y `effort: 'low'` para responder rápido en el salón):

| Tarea | Entrada | Salida |
| --- | --- | --- |
| `plan` | Misiones candidatas, condiciones reales (DONKI y colonia), sugerencia del motor | `mission_id`, `reason_es` y 4 `tasks` (una por especialidad, conectadas entre sí) |
| `narrative` | Misión, tripulación y hasta 4 estudios NTRS/OSDR | `briefing`, `crew_lines`, 3 `twists` y `science` (estudio elegido, resumido para niñas y niños) |
| `logs` | Hasta 40 bitácoras | `stars` (1 a 3), `comment` y `appropriate` por tripulación |
| `debrief` | Resultados y objetivos de aprendizaje | `headline`, 3 `learnings`, `shoutouts` y `reflection` |
| `trainer` | Historial del astronauta, base, clima espacial y retos candidatos del motor | Reto elegido, título, briefing, por qué y pista (los números los pone la física) |
| `coach` | Decisiones del alumno y resultado del simulador | Retroalimentación, siguiente paso y una pregunta |
| `ask` | Pregunta a Don Rover, edad del grupo, misión en curso y datos de la NASA | `answer` (para decirse en voz alta), `face`, `follow_up`, `on_topic` |

En el servidor se usa la beta **`server-side-fallback-2026-07-01`** con `fallbacks: 'default'`: si un filtro de seguridad rechaza la petición, la API la reintenta con otro modelo. Si la API no acepta esa beta, la función la desactiva y sigue sin ella. Las respuestas con `stop_reason` `refusal` o `max_tokens` se descartan y el motor usa su plantilla.

---

## Datos reales de la NASA

`api/nasa.ts` (servidor) y `src/lib/nasa.ts` (cliente):

1. **Estudios científicos.** Se buscan en **NTRS** (`ntrs.nasa.gov/api/citations/search`) y en **OSDR** (`osdr.nasa.gov/osdr/data/search`, biología espacial) con los temas en inglés de cada misión (`MISSION_TOPICS`). Claude elige el estudio más relevante, escribe la misión a partir de él y lo resume. El proyector y los celulares muestran el estudio con su enlace original.
2. **Clima espacial (DONKI).** Se consultan eyecciones de masa coronal (CME), tormentas geomagnéticas (GST), partículas solares energéticas (SEP) y llamaradas (FLR) de los últimos 14 días. De ahí sale un nivel de riesgo de 0 a 3:
   - **3**: hay SEP, Kp ≥ 8 o una llamarada clase X.
   - **2**: Kp ≥ 6, una CME de 1000 km/s o más, o una llamarada M fuerte.
   - **1**: Kp ≥ 5, 10 CME o más, o una llamarada clase M.

   Con el Sol activo, la emergencia es más difícil y el escudo de la colonia se daña.
3. **Salud de la tripulación.** Según el clima y la misión, una condición real (radiación, pérdida de hueso, músculo, defensas o sueño) reduce la eficacia de las acciones. Compartir recursos y vivir en un sector blindado protegen hasta un 75 %. Con radiación, cada celular muestra su dosis estimada (mSv, valor de juego).

Las respuestas se guardan en caché en memoria (máximo 200 entradas) y en el CDN de Vercel. Sin `NASA_API_KEY` se usa `DEMO_KEY`. NTRS y OSDR no necesitan clave.

---

## API del servidor (`api/`)

Son funciones serverless de Vercel (Node, ESM). A propósito no importan nada del proyecto, para que Vercel las empaquete sin sorpresas. Todas responden con `Cache-Control: no-store`, salvo la caché de `nasa`. Los `POST` comprueban que el `Origin` coincida con el `Host`.

### `GET /api/ai` · `POST /api/ai`

```http
GET  /api/ai                          → { ok, enabled, model }
POST /api/ai { task, input }          → { ok, data, model } | { ok:false, error }
     task ∈ plan | narrative | logs | debrief | trainer | coach | ask
```

Códigos de error: `400` datos inválidos · `403` origen no permitido · `405` método no permitido · `429` límite de uso · `502` clave inválida o error de la API · `503` falta `ANTHROPIC_API_KEY`. Tiempo máximo: 60 s.

### `GET /api/nasa`

```http
GET /api/nasa?op=status
GET /api/nasa?op=studies&q=<inglés>&osdr=<inglés>&n=6   → Study[]
GET /api/nasa?op=weather&days=14                        → SpaceWeather
```

`Study = { id, source: 'NTRS'|'OSDR', title, summary, year, url, organism?, platform?, factors? }`
`SpaceWeather = { level 0–3, label, headline, lines[], from, to, cmes, fastestCme, maxKp, sep, flares, strongestFlare, updatedAt }`

### `GET /api/colonies` · `POST /api/colonies`

```http
GET  /api/colonies                               → { configured, connected, colonies }
POST /api/colonies { op:'save',    id, key, colony }
POST /api/colonies { op:'load',    id, key }     → { colony }
POST /api/colonies { op:'log',     id, key, report }
POST /api/colonies { op:'history', id, key }     → { missions[≤50] }
```

`id` son 8 caracteres `[A-Z0-9]` y `key` de 8 a 32. Juntos forman el **código de colonia** `XXXX-XXXX-XXXX-XXXX`. Límites: 300 KB por colonia y 20 KB por reporte. Tiempo máximo: 20 s.

### `GET /api/realtime`

```http
GET /api/realtime → { ok, enabled, url?, key? }
```

Devuelve la URL de Supabase y la clave pública (anon o publishable) para el canal de respaldo. Si solo existe la cadena de Postgres, deduce la URL del proyecto a partir de ella.

En desarrollo, `vite.config.ts` incluye el plugin **`devApi`**, que monta estas mismas funciones en `npm run dev` (con `ssrLoadModule` y un adaptador de `req`/`res` al estilo Vercel) y lee las claves de `.env.local`.

---

## Base de datos (Supabase)

Esquema en [`supabase/schema.sql`](supabase/schema.sql). `api/colonies.ts` también lo crea solo la primera vez que se usa.

| Tabla | Columnas principales |
| --- | --- |
| `donrover_colonies` | `id` (PK, 8 caracteres), `name`, `data` jsonb (colonia completa), `key_hash` (SHA-256), `sol`, `missions`, `created_at`, `updated_at` |
| `donrover_missions` | `id` identity, `colony_id` (FK con cascade), `mission`, `saved`, `score`, `players`, `crews`, `difficulty`, `summary` jsonb, `created_at` · índice `(colony_id, created_at desc)` |

- **RLS activado y sin políticas**: la API pública de Supabase no puede leer ni escribir las tablas. Solo las funciones de Vercel acceden, con `POSTGRES_URL`.
- La clave de cada colonia se guarda como hash `sha256("donrover:" + key)` y se compara con `timingSafeEqual`.
- Un `upsert` solo sobrescribe si el hash coincide, así que nadie puede pisar una colonia ajena.
- Conexión con `prepare: false` (pooler de Supabase en modo transacción), `ssl: 'require'` y una conexión por instancia. `PGSSLMODE=disable` solo sirve para probar con un Postgres local.

Para conectarla: en Vercel, **Storage → Supabase → Connect Project**, y luego volver a desplegar. La consola mostrará **Base de datos conectada · Supabase**.

---

## Mundo 3D (Three.js)

`src/world/` contiene un motor 3D propio sobre Three.js, sin modelos externos: todo es **procedural**.

| Módulo | Qué hace |
| --- | --- |
| `WorldEngine.ts` | Reúne renderizador, planeta, cielo, luces, cámara, entidades y estados en un solo `requestAnimationFrame`, que se detiene cuando la vista no se ve. |
| `planet/terrain.ts` | Planeta como **esfera-cubo** dividida en parcelas con 3 niveles de detalle (40, 20 y 10 divisiones). Carga progresiva con presupuesto de tiempo por cuadro, culling por horizonte y "faldas" para tapar las uniones. Reutiliza la malla entre vistas. |
| `planet/heightfield.ts` | Función determinista `sampleTerrain(dir)`: altura y material en cualquier dirección. La usan la malla, la colocación de objetos y las colisiones. |
| `planet/features.ts` | Geografía ligada al contenido: Monte Olimpo, gran cañón, casquetes polares, hielo enterrado, tubo de lava, mesetas y cráteres. |
| `planet/terrainMaterial.ts` | `MeshStandardMaterial` con shaders GLSL inyectados: zonas de regolito, dunas, basalto, roca y hielo, estratos, ondas de duna, escarcha, pavimento hexagonal en la colonia, normal map procedural y bruma en el limbo. |
| `planet/sky.ts`, `planet/detail.ts` | Cúpula de cielo con degradado y nubes. Miles de piedras en una sola malla instanciada, con semilla fija. |
| `planet/layout.ts`, `zones.ts` | Plano de la colonia MARS-01 (hub, 8 sectores en anillo, edificios desbloqueables, ruta del rover) y registro de zonas y puntos de interés. |
| `models/*` | Modelado procedural (`sculpt.ts`): piezas redondeadas que se fusionan en pocas mallas, con color, rugosidad, metal y brillo por vértice, y un único material PBR compartido. Astronauta con esqueleto y animaciones (idle, walk, run, jump, wave, scan, talk…), IX, Don Rover, edificios y máquinas. |
| `colony/ColonyDirector.ts` | Refleja el estado del juego: salud, edificios, clima y tripulaciones que caminan a su lugar según la fase. También muestra la presencia en tiempo real de los alumnos. |
| `camera/CameraRig.ts`, `InputController.ts` | Cámara orbital sobre la superficie (foco, rumbo, inclinación, distancia) con ratón, táctil, lápiz y teclado. |
| `player/PlayerController.ts`, `PlayerInput.ts` | Astronauta jugable en 1.ª y 3.ª persona con la **gravedad de Marte (3.72 m/s²)**. La velocidad se transporta sobre la esfera, así que se puede dar la vuelta al planeta. |
| `fx/PostFX.ts` | Postproceso *tilt-shift* (efecto maqueta) en una pasada con MSAA. |
| `studio/ModelStudio.ts` | Un solo renderizador WebGL dibuja todos los retratos 3D pequeños de la interfaz, con caché de vistas fijas. |
| `outpost/*` | Puntos de recursos y módulos del modo libre. |
| `react/*` | Puentes con React: `WorldCanvas`, `WorldPlay`, `PlanetView`, `WorldExplorer`, interacciones y zonas de misión. |

**Calidad adaptativa** (`core/config.ts`): `detectQuality()` elige un nivel según el tipo de puntero, los núcleos y la memoria del dispositivo, y el motor lo corrige midiendo los FPS.

| Nivel | Pixel ratio máx. | Sombras | PostFX | MSAA | Partículas |
| --- | --- | --- | --- | --- | --- |
| `low` | 1.25 | — | no | 0 | 60 |
| `medium` | 1.5 | 1024 | no | 0 | 120 |
| `high` | 2 | 2048 | sí | 4 | 200 |

**Controles del astronauta:** `WASD`/flechas para caminar · `Mayús` para correr · `Espacio` para saltar · `V` para cambiar entre 1.ª y 3.ª persona · `E` para interactuar · `1`–`4` para los gestos · arrastrar para mirar · rueda para el zoom. En el celular hay joystick y botones en pantalla.

---

## Don Rover: asistente de voz y placa con pantalla

Don Rover es el asistente del salón. **Habla por las bocinas** de la computadora del profe, **escucha con su micrófono** y, si hay una placa **BIGTREETECH KNOMI v1** (ESP32 con pantalla redonda) conectada, su cara aparece en ella y **mueve la boca** mientras habla. Sin placa, la misma cara se ve en el panel de la consola.

| Qué hace | Cómo |
| --- | --- |
| Narra la misión | Cada fase, el briefing de IX, la pregunta del reto, las emergencias, los resultados y el debrief (se puede apagar). |
| Da las pistas de IX | Cada pista nueva de la bitácora se dice en voz alta con cara de "pensando". |
| Responde preguntas | Botón 🎙️ (o el botón de la placa sostenido): reconoce la voz en español (Chrome/Edge), Claude contesta para la edad del grupo con la misión como contexto y datos de la NASA, sin revelar la respuesta del reto. Sin IA, contesta con su base de conocimiento. También se puede escribir (⌨️). |
| Accesibilidad | Subtítulos grandes de todo lo que dice, voz más lenta o más rápida, volumen, elegir la voz, botón físico para que repita (toque corto) y respeta `prefers-reduced-motion`. |
| Placa | Expresiones según la misión, el código de la sala mientras abordan, el tiempo que queda como anillo (verde → ámbar → rojo) y saludo a cada alumno que entra. |

**Conexión con la placa** (`src/rover/link.ts`): USB con Web Serial (lo más confiable), Wi-Fi en la misma red (WebSocket `ws://<ip>:81` o `POST /cmd`) o el canal en la nube de Supabase `donrover-bot-<ID>` (cuando la plataforma está en HTTPS y el navegador no deja hablar con la red local). La consola se reconecta sola al último camino que funcionó.

**Firmware** (`firmware/donrover-knomi/`, PlatformIO + Arduino): se instala desde el navegador en `#/donrover` (esptool-js, imagen en `public/firmware/`) o con `pio run -t upload`. Detalles, pines y protocolo en [`firmware/donrover-knomi/README.md`](firmware/donrover-knomi/README.md).

| Archivo | Para qué |
| --- | --- |
| `src/rover/link.ts` | Enlace con la placa (USB, Wi-Fi, nube), latido y reconexión |
| `src/rover/voice.ts` | Voz (síntesis), micrófono (reconocimiento), subtítulos y boca |
| `src/rover/assistant.ts` | Preguntas con IA (tarea `ask`) y base de conocimiento sin IA |
| `src/rover/narrator.ts` | Narración de la consola, cara y anillo de tiempo en la placa |
| `src/rover/flasher.ts` | Instalador del firmware desde el navegador |
| `src/rover/RoverFace.tsx`, `RoverPanel.tsx` | Cara en SVG (igual a la de la placa), panel, subtítulos y ajustes |

## Modo libre

`src/pages/free/FreePlay.tsx` y `src/net/freeNet.ts`.

- **Solo:** el inventario, las misiones del explorador y la base se guardan en el dispositivo (`donrover.libre.v2` y `donrover.libre.base.<sala>`).
- **Con amigos:** se crea una sala de 5 caracteres y se comparte `#/libre?sala=XXXXX` o su QR. No hay anfitrión fijo: el primero que llega ocupa el id público de la sala y reparte los mensajes. Si se va, otro toma el relevo. El mundo vive en todos los dispositivos, así que no se pierde nada. Usa el mismo respaldo de Supabase Realtime.
- **Mensajes:** `hi`, `pos`, `mod` (cambios de módulos), `state` (sincronización por lotes de 1500), `emote` y `bye`. Todos son idempotentes. Los módulos son cambios con marca de tiempo (`ModuleEdit`) y gana el más reciente.
- **Recursos:** 🟧 regolito, 🧊 hielo y 🔩 hematita.
- **Módulos:** `solar`, `battery`, `extractor`, `oxygen`, `greenhouse`, `habitat` y `antenna`. Cada uno tiene un costo y un balance de energía, agua, aire, comida y camas (`baseBalance`).
- **Misiones del explorador:** caminar, recolectar, construir cada tipo de módulo, equilibrar la base y llegar a una gran colonia de 12 módulos. Dan XP.
- Hay ciclo de día y noche sincronizado para toda la sala.

---

## Minijuegos

`shared/minigames.ts` (especificación) y `src/pages/play/minigames.tsx` (interfaz). En vez de tocar un botón muchas veces, cada especialidad hace una tarea realista de su sistema. Qué tan bien la haga se convierte en "acciones" para el motor, así que el balance del juego no cambia.

Tipos (`MinigameKind`): `scrub` (limpiar paneles) · `gauge` (mantener presión, CO₂ o temperatura en su zona segura, en unidades reales) · `targets` (sellar fugas o puntos de calor) · `aim` (orientar paneles o la antena) · `dose` (dosificar agua o luz) · `wires` (conectar cables) · `pattern` (repetir una señal) · `budget` (repartir recursos) · `switches` · `tune`.

Cada minijuego muestra un dato real de la NASA. Todos se pueden probar en `#/minijuegos`.

---

## PWA y modo sin conexión

- `public/manifest.webmanifest`: `display: standalone` (con `fullscreen` como preferencia), íconos `any` y `maskable`, y atajos a **Profe** y **Jugar**.
- **Service worker generado en el build** (plugin `pwaServiceWorker` en `vite.config.ts`): toma `pwa/sw.js` y le inyecta la versión y la lista exacta de archivos del bundle, con sus hashes. De las fuentes solo precarga el subconjunto latino.
  - Navegación: primero la red y, sin conexión, `index.html` guardado.
  - Archivos propios: primero la caché.
  - `/api/*`: siempre a la red, nunca a la caché.
  - Al activarse, borra las cachés `ixchel-*` viejas.
- `vercel.json` sirve `sw.js` con `Cache-Control: no-cache`.
- Utilidades (`src/lib/pwa.ts`): instalación, Wake Lock (pantalla siempre encendida), vibración, pantalla completa y detección de conexión.
- Sonido sintetizado con **Web Audio** (`src/lib/sound.ts`): no usa archivos de audio.
- Sin internet funciona el modo demo con bots y todo el contenido propio.

---

## Almacenamiento local

| Clave | Contenido |
| --- | --- |
| `ixchel.settings` | Ajustes del profesor (clave de API, modelo, URL base del QR, señalización, sonido) |
| `ixchel.room` | Snapshot de la sala en curso |
| `ixchel.colonies` | Colonias del grupo |
| `ixchel.profile` | Astronauta, XP e insignias del alumno |
| `ixchel.mute` | Sonido apagado o encendido |
| `ixchel.sig` | Servidor de señalización (modo libre) |
| `donrover.cloud` | Código de la colonia en la nube |
| `donrover.libre.v2`, `donrover.libre.base.<sala>` | Partida y base del modo libre |

---

## Instalación y desarrollo

Requisitos: **Node.js 20 o más reciente** y npm.

```bash
npm install
```

```bash
npm run dev
```

Abre `http://localhost:5173/#/profe`. Sin alumnos, puedes agregar **bots de práctica** desde la barra inferior para ver la misión completa. `npm run dev` también monta las funciones de `api/` y lee las claves de `.env.local`.

> Los celulares no pueden abrir `localhost`. Usa la dirección `Network` que muestra Vite (el servidor escucha en `host: true`) o la versión publicada. La cámara y la instalación como app requieren HTTPS.

| Script | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo de Vite (puerto 5173) con las funciones `api/` |
| `npm run build` | Build de producción en `dist/`, con el service worker generado |
| `npm run preview` | Sirve el build (puerto 4173) |
| `npm run typecheck` | `tsc --noEmit` del cliente y de `api/` (dos `tsconfig`) |
| `npm run icons` | Regenera los íconos PNG de la PWA desde SVG con resvg |

Configuración de TypeScript: `target` ES2022, `moduleResolution: bundler`, `jsx: react-jsx`, `strict`. `tsconfig.json` cubre `src`, `shared` y `vite.config.ts`. `api/tsconfig.json` cubre las funciones.

---

## Variables de entorno

Ver [`.env.example`](.env.example). Todas son opcionales.

| Variable | Usada por | Notas |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | `api/ai.ts` | Activa la IA del servidor. |
| `ANTHROPIC_MODEL` | `api/ai.ts` | Por defecto `claude-opus-5-5`. |
| `NASA_API_KEY` | `api/nasa.ts` | Clave gratuita de api.nasa.gov. Sin ella se usa `DEMO_KEY`. |
| `POSTGRES_URL` (o `POSTGRES_PRISMA_URL`, `DATABASE_URL`, `SUPABASE_DB_URL`, `POSTGRES_URL_NON_POOLING`) | `api/colonies.ts`, `api/realtime.ts` | La crea la integración Supabase ↔ Vercel. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` (o sus variantes `NEXT_PUBLIC_*`, `VITE_*` y `*_PUBLISHABLE_KEY`) | `api/realtime.ts` | Canal de respaldo. La clave anon es pública y no da acceso a las tablas. |
| `PGSSLMODE=disable` | `api/colonies.ts` | Solo para un Postgres local sin SSL. |
| `VERCEL_PROJECT_PRODUCTION_URL` | `vite.config.ts` | La define Vercel al compilar. Hace que el QR apunte al dominio público y no a una URL de despliegue protegida. |

---

## Despliegue

**Vercel (actual).** El repositorio está conectado: cada push a `main` se publica solo. `vercel.json` define `maxDuration` (60 s para `ai`, 20 s para `colonies`) y la cabecera del service worker. Las variables se configuran en *Settings → Environment Variables*. Para probar las funciones localmente también sirven `vercel env pull` y `vercel dev`.

**Cualquier hosting estático.** Ejecuta `npm run build` y sube `dist/` (Netlify, GitHub Pages, Cloudflare Pages…). Como las rutas usan `#`, no hace falta configuración extra. Sin las funciones, el juego usa IA local con plantillas, colonias en el navegador y contenido propio en lugar de los datos de la NASA.

---

## Estructura del repositorio

```
api/                 Funciones serverless de Vercel
  ai.ts              Claude Opus 5.5 (plan, narrativa, bitácoras, debrief, entrenador, preguntas a Don Rover)
  nasa.ts            NTRS + OSDR + DONKI con caché
  colonies.ts        Colonias e historial en Supabase Postgres
  realtime.ts        Configuración pública del canal de respaldo
shared/              Tipos, contenido, rompecabezas, minijuegos, NASA y PRNG (motor y clientes)
src/
  main.tsx, App.tsx  Arranque, fuentes, estilos, service worker y enrutado lazy
  engine/            HostEngine (room.ts), sesión, IA del cliente, colonias y ajustes
  net/               Protocolo, PeerJS (host/player), modo libre y respaldo de Supabase
  lib/               Nube, NASA, reloj, perfil, PWA, rutas y sonido
  components/        Ilustraciones SVG (IX, parches, mapa), Model3D y piezas de UI
  pages/
    Landing.tsx      Presentación
    host/            Consola del profesor (Setup, Console, etapas, mundo, reporte, ajustes)
    play/            App del alumno (avatar, tareas, problemas, minijuegos, mundo)
    free/            Modo libre
    trainer/         Entrenador de misión (simuladores con física real)
    rover/           Don Rover físico (instalar firmware, conectar y probar)
  rover/             Asistente de voz Don Rover y enlace con la placa
  world/             Motor 3D (planeta, cámara, jugador, modelos, colonia, FX, estudio)
  styles/            CSS por área
supabase/schema.sql  Esquema de las tablas
pwa/sw.js            Plantilla del service worker
public/              Manifiesto, íconos de la PWA y firmware de Don Rover (public/firmware/)
firmware/            Firmware de la placa Don Rover (BIGTREETECH KNOMI v1, PlatformIO)
scripts/             Generador de íconos
vite.config.ts       Plugins: React, service worker y API en desarrollo
vercel.json          Duración de funciones y cabeceras
```

---

## Seguridad y privacidad

- **Sin cuentas.** Los alumnos solo escriben un nombre, que se filtra. Su perfil vive en su dispositivo.
- Las claves de Anthropic, la NASA y Postgres solo existen en el servidor. Las instrucciones de la IA también viven ahí: el navegador solo manda datos, así que la clave no sirve para otra cosa que no sea el juego.
- Los `POST` a `/api/ai` y `/api/colonies` validan el origen. Todas las entradas se recortan y se limitan en tamaño.
- Supabase usa RLS sin políticas, claves de colonia hasheadas y comparación en tiempo constante.
- Las salidas de la IA se validan contra JSON Schema y el motor nunca les delega puntajes ni consecuencias.
- WebRTC cifra los datos con DTLS. El servidor de señalización solo presenta a los dispositivos.

---

## Una clase de 40 minutos

| Minutos | Etapa | Actividad |
| --- | --- | --- |
| 00–03 | Abordaje | Escanean el QR y crean su astronauta |
| 03–05 | Tripulación | IX asigna las especialidades |
| 05–08 | Misión | IX genera la misión con datos reales de la NASA |
| 08–15 | Descubrimiento | Cada quien hace su tarea y descifra su transmisión |
| 15–22 | Reto de tripulación | Combinan sus datos, votan y escriben la bitácora |
| 22–30 | Evento global | Emergencia con minijuegos por especialidad |
| 30–35 | Resultados | La colonia cambia con las decisiones |
| 35–40 | Debrief | IX explica lo aprendido y desbloquea progreso |

También existe el ritmo **demo rápida**, de unos 10 minutos, para jueces y pruebas.

---

## Notas

- Los datos científicos vienen de publicaciones de la NASA. Los porcentajes de la colonia, las dosis y las penalizaciones son valores de juego simplificados para el salón.
- La señal de *The Unknown Signal* es parte de la historia. No es una afirmación sobre señales extraterrestres reales.
- Don Rover es el rover que recorre la colonia MARS-01: el taller donde cada clase aprende a sobrevivir en Marte.
