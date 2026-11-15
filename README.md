# Taller de Don Rover

**Un salón. Varias tripulaciones. Un planeta por salvar.**

El Taller de Don Rover es una plataforma de aprendizaje multijugador nativa de IA que convierte cualquier salón de clases en una colonia espacial que debe sobrevivir. Los alumnos forman tripulaciones de cuatro, cada quien recibe una especialidad y una pieza secreta de información, la IA convierte objetos del salón en misiones científicas y las decisiones de cada tripulación cambian un planeta que comparte toda la clase.

Es una **PWA que corre 100% en el navegador**: no hay servidor que instalar. El navegador del profesor (la pantalla del proyector) es el anfitrión del juego y los celulares de los alumnos se conectan directo por WebRTC escaneando un QR.

## Qué incluye

- **Presentación** (`#/`): la propuesta completa del proyecto, con el planeta y los personajes en 3D.
- **Consola del profesor** (`#/profe`): abordaje con QR, formación automática de tripulaciones, escáner del mundo, briefing, transmisiones cifradas, reto de tripulación, evento global, resultados y debrief. Incluye estado global del planeta, bitácora de IX, pistas, pausa y reporte descargable en CSV.
- **Modo libre** (`#/libre`): sin código de clase. Cada quien explora Marte con su astronauta, **mina** el planeta, **fabrica** bloques en la impresora 3D y **construye** su base, al estilo de un juego de bloques. Se puede jugar solo o crear una sala y **compartir un enlace o un QR** para que los amigos entren al mismo mundo (ver [Modo libre](#modo-libre)).
- **App del alumno** (`#/jugar`): astronauta personalizable, descifrado de transmisiones con retos científicos, votación interna, bitácora de la tripulación, minijuego de emergencia, XP e insignias guardados en el dispositivo.
- **6 misiones**: Greenhouse Rescue, The Water Crisis, Darkness Protocol, The Unknown Signal, Habitat Zero y The Final Colony. Cada tripulación recibe números distintos y cada rol tiene un dato imprescindible para encontrar la mejor decisión.
- **Colonia persistente**: el mapa de MARS-01 cambia con los resultados, se desbloquean edificios y la colonia del grupo se guarda entre clases (con exportar e importar).
- **Classroom Event Generator**: IX envía pistas si la clase tiene dificultades, desbloquea una emergencia bonus si todo es fácil y activa el protocolo de tripulación si un equipo participa poco.

## Cómo correrlo

Requisitos: Node.js 20 o más reciente.

```bash
npm install
npm run dev
```

Abre `http://localhost:5173/#/profe` en la computadora conectada al proyector. Sin alumnos, agrega **bots de práctica** desde la barra inferior para ver la misión completa.

> Los celulares no pueden abrir `localhost`. Para jugar en un salón, publica la app (ver abajo) o abre el Taller de Don Rover con la IP de tu red local (`npm run dev` muestra la dirección `Network`). La cámara y la instalación como app requieren HTTPS.

## Publicar

```bash
npm run build
```

Sube la carpeta `dist/` a cualquier hosting estático con HTTPS (Netlify, Vercel, GitHub Pages, Cloudflare Pages…). La app usa rutas con `#`, así que no necesita configuración extra. El service worker guarda la app para que abra sin conexión; sin internet funciona el modo demo con bots.

El proyecto ya está conectado a **Vercel**: cada push a `main` se publica solo. En Vercel, además de la app, corren dos funciones del servidor (carpeta `api/`):

| Función | Para qué sirve | Variable que necesita |
| --- | --- | --- |
| `api/colonies.ts` | Guarda cada colonia y el historial de misiones en **Supabase** | `POSTGRES_URL` (la crea la integración de Supabase) |
| `api/ai.ts` | IA con **Claude Opus 5.5** sin exponer la clave | `ANTHROPIC_API_KEY` |
| `api/nasa.ts` | Estudios científicos y clima espacial reales de la **NASA** | `NASA_API_KEY` (opcional: sin ella usa `DEMO_KEY`) |

Ambas son opcionales: si falta la variable, el juego funciona igual que antes (colonias en el navegador, IA local). Puedes ver el ejemplo en [`.env.example`](.env.example).

## Base de datos (Supabase en Vercel)

1. En Vercel, conecta la base de Supabase al proyecto (**Storage → Supabase → Connect Project**). La integración agrega `POSTGRES_URL` y las demás variables.
2. Vuelve a desplegar. La primera vez, `api/colonies.ts` crea las tablas `donrover_colonies` y `donrover_missions` (también están en [`supabase/schema.sql`](supabase/schema.sql) por si prefieres crearlas a mano).
3. En la consola del profesor aparece **Base de datos conectada · Supabase**. Cada colonia muestra su **código de colonia** (`XXXX-XXXX-XXXX-XXXX`): con él se abre la misma colonia en otra computadora, sin cuentas.

Las tablas tienen RLS activado y sin políticas: la API pública de Supabase no puede leerlas. Solo las funciones de Vercel acceden, y la clave de cada colonia se guarda como hash.

Para probar las funciones en tu computadora usa `vercel dev` (con `vercel env pull` para traer las variables); `npm run dev` corre solo la app, sin funciones.

## Datos reales de la NASA

Cada misión usa datos reales, a través de `api/nasa.ts`:

1. **Estudios científicos → misión generada por la IA.** Al empezar una misión se buscan investigaciones reales sobre su tema en el **NTRS** (Servidor de Reportes Técnicos de la NASA) y en el **OSDR** (Repositorio de Datos Científicos Abiertos, biología espacial). Claude Opus 5.5 elige la más relevante, escribe la misión a partir de ella y la resume para niñas y niños; el proyector y los celulares muestran el estudio con su enlace original.
2. **Clima espacial real (DONKI).** Se consultan eyecciones de masa coronal, tormentas geomagnéticas, partículas solares y llamaradas de los últimos 14 días. Si el Sol está activo de verdad, la emergencia es más difícil (la meta sube) y el escudo de radiación de la colonia se daña.
3. **Salud de los tripulantes.** Según el clima espacial y la misión, una condición real (radiación, pérdida de hueso, músculos, defensas o sueño, con un estudio del OSDR/NTRS) afecta a todos los tripulantes: sus acciones rinden menos. Compartir recursos con la colonia y vivir en un sector blindado los protege; con radiación, cada celular muestra su dosis estimada.

Sin conexión o sin la función, el juego sigue con su contenido propio. Las respuestas de la NASA se guardan en caché para no gastar el límite de la clave.

## Minijuegos de la emergencia

En la etapa de acción, cada especialidad hace una tarea realista de su sistema: limpiar paneles solares, regular presión/CO₂/temperatura con su zona segura en unidades reales, sellar fugas o puntos de calor, orientar paneles o la antena, dosificar agua o luz a las plantas, conectar cables y repetir el patrón de una señal. Cada minijuego muestra un dato real de la NASA. Se pueden probar todos en `#/minijuegos`.

## Modo libre

Quien no tiene un código de clase puede jugar desde la portada (**Jugar ahora**) o desde la pantalla de **Únete a la misión** (**¿No tienes código?**).

- **Jugar solo**: el mundo, el inventario y las misiones del explorador se guardan en el dispositivo.
- **Con amigos**: se crea una sala de 5 caracteres y se comparte el enlace `#/libre?sala=XXXXX` (o el QR). Todos ven el mismo planeta, a los demás astronautas en tiempo real y los bloques que cada quien pone o quita. No hay anfitrión fijo: si quien creó la sala se va, otro dispositivo toma el relevo.
- **Bloques**: regolito, basalto, hielo, hematita y cristal se minan del suelo y de los depósitos repartidos por el planeta; ladrillo, vidrio, panel, lámpara y cultivo se fabrican en la impresora 3D (así funcionaría una colonia real: con los recursos del lugar).
- **Controles**: `WASD` caminar · `Espacio` saltar · clic izquierdo minar · clic derecho construir · `1`–`0` elegir bloque · `C` fabricar · `V` primera/tercera persona. En el celular: joystick, botón de salto y un botón para alternar entre minar y construir.

Los bloques viven en una rejilla "esfera-cubo" (`src/world/blocks/`) y la sala usa PeerJS con el canal de respaldo de Supabase Realtime (`src/net/freeNet.ts`).

## Inteligencia artificial

- **Sin clave**: el escáner usa visión local con TensorFlow.js (COCO-SSD) y un detector de brillo para las fuentes de luz. La foto se analiza en el navegador y nunca sale del dispositivo. Las narrativas usan plantillas revisadas.
- **Claude Opus 5.5 en el servidor** (recomendado): agrega `ANTHROPIC_API_KEY` en las variables de entorno del proyecto en Vercel y vuelve a desplegar. La función `api/ai.ts` clasifica las fotos del escáner, personaliza la historia, evalúa la creatividad de las bitácoras y escribe el debrief. La clave nunca llega al navegador y las instrucciones viven en el servidor, así que solo sirve para el juego. Si un filtro de seguridad rechaza una petición, la API la reintenta sola con otro modelo (`fallbacks: "default"`).
- **Clave en el navegador** (alternativa): en **Ajustes** de la consola, pega una clave de API de Anthropic. Se guarda solo en ese navegador; usa una clave con límite de gasto.

Principio de diseño: **la IA narra, el motor decide**. Los recursos, las puntuaciones y las consecuencias los calcula un motor determinista; el modelo solo escribe dentro de plantillas con salidas estructuradas.

## Conexión entre dispositivos

Las conexiones usan WebRTC mediante [PeerJS](https://peerjs.com). El servidor público y gratuito de PeerJS solo presenta a los dispositivos; el juego viaja directo entre ellos y cifrado. Si tu escuela tiene su propio PeerServer, configúralo en **Ajustes → Servidor de señalización propio**.

## Una clase de 40 minutos

| Minutos | Etapa | Actividad |
| --- | --- | --- |
| 00–03 | Join the mission | Escanean el QR y crean su astronauta |
| 03–05 | Crew assignment | IX forma tripulaciones y asigna roles |
| 05–08 | World scanner | Un objeto del salón desbloquea la misión |
| 08–15 | Discovery | Cada quien descifra su transmisión secreta |
| 15–22 | Crew challenge | Los cuatro roles combinan datos y votan |
| 22–30 | Global event | Toda la clase enfrenta una emergencia |
| 30–35 | Mission results | La colonia cambia con las decisiones |
| 35–40 | Debrief | IX explica lo aprendido y desbloquea progreso |

También hay un ritmo de **demo rápida** (unos 10 minutos) para jueces y pruebas.

## Estructura

```
shared/          Contenido, tipos y generadores de rompecabezas (compartido)
src/engine/      Motor del juego, IA (Claude), visión local, colonias y ajustes
src/net/         Conexión WebRTC entre el proyector y los celulares
src/components/  Ilustraciones SVG (astronautas, IX, parches, mapa) y piezas de UI
src/pages/       Presentación, consola del profesor y app del alumno
src/world/       Mundo 3D: planeta, colonia, astronautas, modo jugador en 1.ª y 3.ª persona
api/             Funciones de Vercel: base de datos (Supabase) e IA (Claude Opus 5.5)
supabase/        Esquema SQL de las tablas
pwa/sw.js        Plantilla del service worker (se genera en el build)
public/          Manifiesto e íconos de la PWA
```

Scripts útiles: `npm run typecheck` (verificación de tipos) y `npm run icons` (regenera los íconos).

## Tecnología

React + TypeScript + Vite · PeerJS (WebRTC) · TensorFlow.js · Claude API (opcional) · SVG animado · PWA con service worker propio.

## Notas

- Los datos científicos se basan en publicaciones de la NASA. Los porcentajes de la colonia son valores de juego.
- La señal de la misión *The Unknown Signal* es un recurso ficticio de la historia, no una afirmación sobre señales extraterrestres reales.
- Don Rover es el rover que recorre la colonia MARS-01: el taller donde cada clase aprende a sobrevivir en Marte.
