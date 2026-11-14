# El Taller de Don Rover — The Classroom Space Mission

**Un salón. Varias tripulaciones. Un planeta por salvar.**

IXCHEL es una plataforma de aprendizaje multijugador nativa de IA que convierte cualquier salón de clases en una colonia espacial que debe sobrevivir. Los alumnos forman tripulaciones de cuatro, cada quien recibe una especialidad y una pieza secreta de información, la IA convierte objetos del salón en misiones científicas y las decisiones de cada tripulación cambian un planeta que comparte toda la clase.

Es una **PWA que corre 100% en el navegador**: no hay servidor que instalar. El navegador del profesor (la pantalla del proyector) es el anfitrión del juego y los celulares de los alumnos se conectan directo por WebRTC escaneando un QR.

## Qué incluye

- **Presentación** (`#/`): la propuesta completa del proyecto, con ilustraciones originales.
- **Consola del profesor** (`#/profe`): abordaje con QR, formación automática de tripulaciones, escáner del mundo, briefing, transmisiones cifradas, reto de tripulación, evento global, resultados y debrief. Incluye estado global del planeta, bitácora de IX, pistas, pausa y reporte descargable en CSV.
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

> Los celulares no pueden abrir `localhost`. Para jugar en un salón, publica la app (ver abajo) o abre IXCHEL con la IP de tu red local (`npm run dev` muestra la dirección `Network`). La cámara y la instalación como app requieren HTTPS.

## Publicar

```bash
npm run build
```

Sube la carpeta `dist/` a cualquier hosting estático con HTTPS (Netlify, Vercel, GitHub Pages, Cloudflare Pages…). La app usa rutas con `#`, así que no necesita configuración extra. El service worker guarda la app para que abra sin conexión; sin internet funciona el modo demo con bots.

## Inteligencia artificial

- **Sin clave**: el escáner usa visión local con TensorFlow.js (COCO-SSD) y un detector de brillo para las fuentes de luz. La foto se analiza en el navegador y nunca sale del dispositivo. Las narrativas usan plantillas revisadas.
- **Con Claude** (opcional): en **Ajustes** de la consola, pega una clave de API de Anthropic. IX usará visión multimodal para reconocer cualquier objeto, personalizará la historia, evaluará la creatividad de las bitácoras y escribirá el debrief. La clave se guarda solo en ese navegador; usa una clave con límite de gasto.

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
pwa/sw.js        Plantilla del service worker (se genera en el build)
public/          Manifiesto e íconos de la PWA
```

Scripts útiles: `npm run typecheck` (verificación de tipos) y `npm run icons` (regenera los íconos).

## Tecnología

React + TypeScript + Vite · PeerJS (WebRTC) · TensorFlow.js · Claude API (opcional) · SVG animado · PWA con service worker propio.

## Notas

- Los datos científicos se basan en publicaciones de la NASA. Los porcentajes de la colonia son valores de juego.
- La señal de la misión *The Unknown Signal* es un recurso ficticio de la historia, no una afirmación sobre señales extraterrestres reales.
- Ixchel es la diosa maya de la Luna y del tejido: cada tripulación es un hilo y, juntas, forman la colonia.
