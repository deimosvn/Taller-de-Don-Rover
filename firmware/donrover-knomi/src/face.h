// Cara de Don Rover en la pantalla redonda de la KNOMI (240 × 240).
//
// La cabeza del rover del juego es una caja blanca con dos cámaras que brillan en cian: aquí
// esas cámaras son los ojos y una boca de luz que se abre cuando Don Rover habla. Todo se
// dibuja en un sprite (memoria PSRAM) y se manda completo a la pantalla unas 30 veces por segundo.

#pragma once
#include <Arduino.h>

enum class Expr : uint8_t { Neutral, Happy, Sad, Alert, Think, Wow, Sleep, Listen, Star };

Expr exprFromName(const char *name);
const char *exprName(Expr e);

namespace face {

/** Enciende la pantalla y la luz de fondo. */
void begin();

/** Cambia la expresión; con holdMs > 0 vuelve sola a la neutral después de ese tiempo. */
void setExpr(Expr e, uint32_t holdMs = 0);
Expr expr();

/** Don Rover está hablando: la boca se mueve sola, con sílabas. */
void setTalking(bool on);
/** Golpe de voz (0–1) que manda la computadora: abre la boca al ritmo de lo que suena. */
void mouthPulse(float level);

/** Hacia dónde mira (−1…1); vuelve a mirar al frente en unos segundos. */
void look(float x, float y);

/** Anillo de progreso alrededor de la pantalla (p < 0 lo oculta). */
void ring(float p, uint16_t color);
/** Anillo que late (escuchando, alerta). color = 0 lo apaga. */
void pulse(uint16_t color);

/** Tarjeta con texto grande encima de la cara (título vacío = ocultar). ms = 0: hasta que se oculte. */
void card(const String &title, const String &sub, uint32_t ms = 0);

/** Punto de estado: 0 sin computadora, 1 solo Wi-Fi, 2 conectado a la plataforma. */
void status(uint8_t link);

/** Brillo de la pantalla (0–255). */
void brightness(uint8_t v);

/** Convierte "#RRGGBB" a color de la pantalla. */
uint16_t parseColor(const char *hex, uint16_t fallback);

/** Avanza la animación y dibuja (llamar en cada vuelta del loop). */
void update();

}  // namespace face
