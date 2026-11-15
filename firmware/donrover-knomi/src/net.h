// Conexión de Don Rover con la plataforma por Wi-Fi.
//
//   · Red local: servidor WebSocket en el puerto 81 (ws://donrover.local:81) y HTTP en el 80
//     (estado, configuración del Wi-Fi y POST /cmd para páginas que no pueden abrir WebSockets).
//   · Nube: si la plataforma está en HTTPS (Vercel), el navegador no siempre puede hablar con
//     la red local. Entonces la placa se une al mismo canal de Supabase Realtime que usa el juego
//     ("donrover-bot-<ID>"), pidiendo la configuración pública a <plataforma>/api/realtime.
//   · Sin Wi-Fi configurado: abre la red "DonRover-<ID>" con una página para elegir el Wi-Fi.
//
// El USB (puerto serie) lo atiende main.cpp: los tres caminos hablan el mismo protocolo JSON.

#pragma once
#include <Arduino.h>

enum Source : uint8_t { SRC_USB = 0, SRC_WIFI = 1, SRC_CLOUD = 2 };

typedef void (*CommandHandler)(const String &json, Source src);

namespace net {

/** Arranca la red en su propia tarea (la cara y el USB nunca esperan a la red). */
void begin(CommandHandler handler);

/** Guarda la red y se conecta (se aplica en la tarea de red). */
void setWifi(const String &ssid, const String &pass);
/** Olvida la red y vuelve a abrir el portal de configuración. */
void forget();
/** Dirección de la plataforma (para el canal en la nube). */
void setApp(const String &url);

/** Manda un evento a la plataforma por Wi-Fi y por la nube (se puede llamar desde cualquier tarea). */
void send(const String &json);

/** Identificador corto de la placa (6 caracteres, sale de su MAC). */
const String &id();
/** Estado de la red en JSON: {"id","wifi","ssid","ip","cloud","app","ap"}. */
String status();
/** 0 = sin Wi-Fi · 1 = en la red. */
uint8_t online();
/** Páginas conectadas por WebSocket en la red local o por la nube. */
bool remoteLinked();
/** Cambió el estado de la red desde la última consulta. */
bool changed();

}  // namespace net
