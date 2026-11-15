#include "face.h"

#include <TFT_eSPI.h>

static TFT_eSPI tft;
static TFT_eSprite spr(&tft);

// Los comandos llegan desde dos tareas (USB y red): el estado se protege con un candado.
static SemaphoreHandle_t mu = nullptr;
struct Lock {
  Lock() {
    if (mu) xSemaphoreTake(mu, portMAX_DELAY);
  }
  ~Lock() {
    if (mu) xSemaphoreGive(mu);
  }
};

/* ---------------- colores (RGB565) ---------------- */

static uint16_t rgb(uint32_t hex) { return tft.color565((hex >> 16) & 0xFF, (hex >> 8) & 0xFF, hex & 0xFF); }

static uint16_t mix(uint16_t a, uint16_t b, float t) {
  t = constrain(t, 0.0f, 1.0f);
  const int ar = (a >> 11) & 31, ag = (a >> 5) & 63, ab = a & 31;
  const int br = (b >> 11) & 31, bg = (b >> 5) & 63, bb = b & 31;
  return ((int)(ar + (br - ar) * t) << 11) | ((int)(ag + (bg - ag) * t) << 5) | (int)(ab + (bb - ab) * t);
}

static uint16_t C_PLATE, C_EDGE, C_RIM, C_LENS, C_PUPIL, C_WHITE, C_LED, C_MOUTH, C_TONGUE, C_BLUSH, C_CARD, C_MUTED;
static uint16_t C_CYAN, C_GLOW, C_ORANGE, C_PURPLE, C_BLUE, C_GOLD, C_GREEN, C_AMBER, C_GREY;

/* ---------------- estado ---------------- */

static Expr cur = Expr::Neutral;
static uint32_t holdUntil = 0;
static bool talking = false;
static float pulseLevel = 0, mouth = 0, sylPhase = 0, sylRate = 4.2f;
static bool sylPause = false;
static float lookX = 0, lookY = 0, eyeX = 0, eyeY = 0;
static uint32_t lookUntil = 0, nextSaccade = 0;
static uint32_t nextBlink = 2500, blinkStart = 0;
static bool doubleBlink = false;
static float ringP = -1;
static uint16_t ringColor = 0, pulseColor = 0;
static String cardTitle, cardSub;
static uint32_t cardUntil = 0;
static uint8_t linkState = 0;
static uint32_t lastFrame = 0, lastTick = 0;
static float t = 0;

Expr exprFromName(const char *n) {
  if (!n) return Expr::Neutral;
  if (!strcmp(n, "happy")) return Expr::Happy;
  if (!strcmp(n, "sad")) return Expr::Sad;
  if (!strcmp(n, "alert")) return Expr::Alert;
  if (!strcmp(n, "think")) return Expr::Think;
  if (!strcmp(n, "wow")) return Expr::Wow;
  if (!strcmp(n, "sleep")) return Expr::Sleep;
  if (!strcmp(n, "listen")) return Expr::Listen;
  if (!strcmp(n, "star")) return Expr::Star;
  return Expr::Neutral;
}

const char *exprName(Expr e) {
  switch (e) {
    case Expr::Happy: return "happy";
    case Expr::Sad: return "sad";
    case Expr::Alert: return "alert";
    case Expr::Think: return "think";
    case Expr::Wow: return "wow";
    case Expr::Sleep: return "sleep";
    case Expr::Listen: return "listen";
    case Expr::Star: return "star";
    default: return "neutral";
  }
}

/** La pantalla solo tiene letras sin acentos: "Misión" → "Mision", "¿Qué?" → "Que?". */
static String ascii(const String &in) {
  String out;
  out.reserve(in.length());
  for (size_t i = 0; i < in.length(); i++) {
    const uint8_t c = in[i];
    if (c < 0x80) {
      out += (char)c;
      continue;
    }
    if (c == 0xC3 && i + 1 < in.length()) {
      const uint8_t d = in[++i];
      const char *map = "AAAAAAACEEEEIIIIDNOOOOOxOUUUUYTsaaaaaaaceeeeiiiidnooooo/ouuuuyty";
      if (d >= 0x80 && d <= 0xBF) out += map[d - 0x80];
      continue;
    }
    if (c == 0xC2 && i + 1 < in.length()) {
      i++;  // ¿ ¡ ° y similares se omiten
      continue;
    }
    // Otros caracteres de varios bytes (emojis…): se saltan.
    if (c >= 0xF0) i += 3;
    else if (c >= 0xE0) i += 2;
    else if (c >= 0xC0) i += 1;
  }
  return out;
}

namespace face {

uint16_t parseColor(const char *hex, uint16_t fallback) {
  if (!hex || hex[0] != '#' || strlen(hex) != 7) return fallback;
  return rgb(strtoul(hex + 1, nullptr, 16));
}

void brightness(uint8_t v) { ledcWrite(0, v); }

void begin() {
  mu = xSemaphoreCreateMutex();
  ledcSetup(0, 5000, 8);
  ledcAttachPin(PIN_BACKLIGHT, 0);
  brightness(0);
  tft.init();
  tft.setRotation(0);
  tft.fillScreen(TFT_BLACK);

  C_PLATE = rgb(0x241C4E);
  C_EDGE = rgb(0x15102F);
  C_RIM = rgb(0x5A4F9A);
  C_LENS = rgb(0x0E0A24);
  C_PUPIL = rgb(0x0B2F40);
  C_WHITE = rgb(0xFFF8EC);
  C_LED = rgb(0x7FDBFF);
  C_MOUTH = rgb(0x0E0A24);
  C_TONGUE = rgb(0xF08A57);
  C_BLUSH = mix(C_PLATE, rgb(0xFF7FA3), 0.55f);
  C_CARD = rgb(0x120E2E);
  C_MUTED = rgb(0xB9B3D9);
  C_CYAN = rgb(0x7FDBFF);
  C_GLOW = rgb(0x2E7FA0);
  C_ORANGE = rgb(0xFF8A5B);
  C_PURPLE = rgb(0xB69CFF);
  C_BLUE = rgb(0x8FB8FF);
  C_GOLD = rgb(0xFFD86B);
  C_GREEN = rgb(0x55DB7A);
  C_AMBER = rgb(0xFFC93C);
  C_GREY = rgb(0x6B6590);

  spr.setColorDepth(16);
  spr.setAttribute(PSRAM_ENABLE, true);
  if (!spr.createSprite(240, 240)) {
    // Sin PSRAM: sprite de 8 bits (cabe en la memoria interna).
    spr.setColorDepth(8);
    spr.createSprite(240, 240);
  }
  // Empieza dormido: la primera conexión lo despierta.
  cur = Expr::Sleep;
  lastTick = millis();
  for (int v = 0; v <= 200; v += 8) {
    brightness(v);
    delay(8);
  }
}

void setExpr(Expr e, uint32_t holdMs) {
  Lock l;
  cur = e;
  holdUntil = holdMs ? millis() + holdMs : 0;
}

Expr expr() { return cur; }

void setTalking(bool on) {
  Lock l;
  talking = on;
  if (on && cur == Expr::Sleep) cur = Expr::Neutral;
}

void mouthPulse(float level) {
  Lock l;
  pulseLevel = max(pulseLevel, constrain(level, 0.0f, 1.0f));
}

void look(float x, float y) {
  Lock l;
  lookX = constrain(x, -1.0f, 1.0f);
  lookY = constrain(y, -1.0f, 1.0f);
  lookUntil = millis() + 2500;
}

void ring(float p, uint16_t color) {
  Lock l;
  ringP = p;
  ringColor = color;
}

void pulse(uint16_t color) {
  Lock l;
  pulseColor = color;
}

void card(const String &title, const String &sub, uint32_t ms) {
  const String a = ascii(title), b = ascii(sub);
  Lock l;
  cardTitle = a;
  cardSub = b;
  cardUntil = cardTitle.length() ? (ms ? millis() + ms : UINT32_MAX) : 0;
}


void status(uint8_t link) {
  Lock l;
  linkState = link;
}

/* ---------------- dibujo ---------------- */

static void star(int cx, int cy, float r, uint16_t color) {
  float px[10], py[10];
  for (int i = 0; i < 10; i++) {
    const float a = -PI / 2 + i * PI / 5;
    const float rr = (i % 2) ? r * 0.45f : r;
    px[i] = cx + cosf(a) * rr;
    py[i] = cy + sinf(a) * rr;
  }
  for (int i = 0; i < 10; i++) {
    const int j = (i + 1) % 10;
    spr.fillTriangle(cx, cy, px[i], py[i], px[j], py[j], color);
  }
}

static uint16_t irisColor() {
  switch (cur) {
    case Expr::Alert: return C_ORANGE;
    case Expr::Listen: return C_PURPLE;
    case Expr::Sad: return C_BLUE;
    case Expr::Star: return C_GOLD;
    default: return C_CYAN;
  }
}

static void eye(int cx, int cy, bool left, float open) {
  const int R = cur == Expr::Wow ? 39 : 34;

  if (cur == Expr::Happy) {
    spr.drawArc(cx, cy + 12, 27, 19, 118, 242, irisColor(), C_PLATE, true);
    return;
  }
  if (cur == Expr::Star) {
    star(cx, cy, 30, C_GOLD);
    return;
  }
  if (cur == Expr::Sleep || open < 0.12f) {
    // Ojo cerrado: una rayita curva, como si sonriera dormido.
    spr.drawArc(cx, cy - 14, 24, 19, 300, 60, cur == Expr::Sleep ? C_GREY : C_RIM, C_PLATE, true);
    return;
  }

  // La cámara: carcasa, lente oscura, iris que brilla, pupila y reflejos.
  spr.fillSmoothCircle(cx, cy, R, C_RIM);
  spr.fillSmoothCircle(cx, cy, R - 5, C_LENS);
  const uint16_t iris = irisColor();
  const int ix = cx + eyeX * 9, iy = cy + eyeY * 9;
  const int ir = cur == Expr::Wow ? 21 : 19;
  spr.fillSmoothCircle(ix, iy, ir + 4, mix(C_LENS, iris, 0.35f));
  spr.fillSmoothCircle(ix, iy, ir, iris);
  spr.fillSmoothCircle(ix, iy, cur == Expr::Wow ? 5 : 8, C_PUPIL);
  spr.fillSmoothCircle(ix - 7, iy - 8, 4, C_WHITE);
  spr.fillSmoothCircle(ix + 6, iy + 6, 2, C_WHITE);

  // Párpados: tapan la cámara desde arriba (parpadeo y expresiones).
  if (open < 0.98f) {
    const int top = cy - R - 3;
    const int lid = cy - R + (int)((2 * R) * (1 - open));
    spr.fillRect(cx - R - 3, top, 2 * R + 6, lid - top, C_PLATE);
    const float dy = lid - cy;
    if (fabsf(dy) < R) {
      const float w = sqrtf(R * R - dy * dy);
      spr.drawWideLine(cx - w + 1, lid, cx + w - 1, lid, 3, C_RIM);
    }
  }
  if (cur == Expr::Sad) {
    // Ceja triste: el lado de afuera cae.
    const int ox = left ? cx - R - 4 : cx + R + 4;
    spr.fillTriangle(cx - R - 4, cy - R - 4, cx + R + 4, cy - R - 4, ox, cy - R / 6, C_PLATE);
  } else if (cur == Expr::Alert) {
    // Ceja decidida: el lado de adentro baja.
    const int ix2 = left ? cx + R + 4 : cx - R - 4;
    spr.fillTriangle(cx - R - 4, cy - R - 4, cx + R + 4, cy - R - 4, ix2, cy - R / 3, C_PLATE);
  }
}

static void drawMouth(int mx, int my) {
  const float m = mouth;
  if (cur == Expr::Wow && m < 0.1f) {
    spr.fillSmoothCircle(mx, my, 12, C_LED);
    spr.fillSmoothCircle(mx, my, 8, C_MOUTH);
    return;
  }
  if (m < 0.07f) {
    switch (cur) {
      case Expr::Happy:
      case Expr::Star:
        spr.drawArc(mx, my - 16, 30, 24, 300, 60, C_LED, C_PLATE, true);
        break;
      case Expr::Sad:
        spr.drawArc(mx, my + 20, 26, 21, 135, 225, C_LED, C_PLATE, true);
        break;
      case Expr::Sleep:
        spr.fillSmoothRoundRect(mx - 12, my - 2, 24, 5, 2, C_GREY);
        break;
      case Expr::Think:
        spr.fillSmoothRoundRect(mx - 6, my - 3, 30, 6, 3, C_LED);
        break;
      default:
        spr.fillSmoothRoundRect(mx - 22, my - 3, 44, 6, 3, C_LED);
    }
    return;
  }
  // Boca abierta: borde de luz, interior oscuro y lengua cuando se abre mucho.
  const bool round = cur == Expr::Wow;
  const int h = 8 + (int)(38 * m);
  const int w = round ? h + 6 : 56 - (int)(12 * m);
  const int x = mx - w / 2, y = my - h / 2;
  const int r = min(w, h) / 2;
  spr.fillSmoothRoundRect(x, y, w, h, r, C_LED);
  spr.fillSmoothRoundRect(x + 3, y + 3, w - 6, h - 6, max(1, r - 3), C_MOUTH);
  if (h > 24) spr.fillSmoothRoundRect(mx - w / 4, y + h - 3 - 9, w / 2, 9, 4, C_TONGUE);
}

static void drawRing() {
  if (pulseColor) {
    const float k = 0.5f + 0.5f * sinf(t * 5.5f);
    spr.drawSmoothArc(120, 120, 119, 112, 0, 360, mix(C_EDGE, pulseColor, 0.35f + 0.65f * k), C_EDGE, false);
    return;
  }
  if (ringP < 0) return;
  spr.drawSmoothArc(120, 120, 119, 113, 0, 360, mix(C_EDGE, ringColor, 0.22f), C_EDGE, false);
  const float p = constrain(ringP, 0.0f, 1.0f);
  if (p >= 0.995f) {
    spr.drawSmoothArc(120, 120, 119, 113, 0, 360, ringColor, C_EDGE, false);
  } else if (p > 0.005f) {
    // 180° es las 12 en punto; el arco avanza como las manecillas del reloj.
    const uint32_t end = (180 + (uint32_t)(360 * p)) % 360;
    spr.drawSmoothArc(120, 120, 119, 113, 180, end, ringColor, C_EDGE, true);
  }
}

static void wrapText(const String &s, int y, int maxW, int lineH, int maxLines) {
  String line, word;
  int lines = 0;
  auto flush = [&](const String &l) {
    if (lines < maxLines) spr.drawString(l, 120, y + lines * lineH);
    lines++;
  };
  for (size_t i = 0; i <= s.length(); i++) {
    const char c = i < s.length() ? s[i] : ' ';
    if (c != ' ') {
      word += c;
      continue;
    }
    if (!word.length()) continue;
    const String test = line.length() ? line + " " + word : word;
    if (spr.textWidth(test) > maxW && line.length()) {
      flush(line);
      line = word;
    } else {
      line = test;
    }
    word = "";
  }
  if (line.length()) flush(line);
}

static void drawCard() {
  spr.fillSmoothRoundRect(22, 64, 196, 112, 26, C_RIM);
  spr.fillSmoothRoundRect(25, 67, 190, 106, 23, C_CARD);
  spr.setTextColor(C_WHITE, C_CARD);
  spr.setTextDatum(MC_DATUM);
  const bool big = cardTitle.length() <= 6;
  spr.setFreeFont(big ? &FreeSansBold24pt7b : &FreeSansBold12pt7b);
  if (!big && spr.textWidth(cardTitle) > 180) spr.setFreeFont(&FreeSansBold9pt7b);
  spr.drawString(cardTitle, 120, cardSub.length() ? (big ? 104 : 100) : 120);
  if (cardSub.length()) {
    spr.setFreeFont(&FreeSans9pt7b);
    spr.setTextColor(C_MUTED, C_CARD);
    wrapText(cardSub, big ? 140 : 132, 176, 18, 2);
  }
}

static void render() {
  const float breathe = sinf(t * 1.6f) * 2.0f;
  spr.fillSprite(TFT_BLACK);
  spr.fillSmoothCircle(120, 120, 120, C_EDGE);
  spr.fillSmoothCircle(120, 120, 111, C_PLATE);
  // Brillo suave arriba, como el plástico de la cabeza del rover.
  spr.fillSmoothRoundRect(70, 18, 100, 10, 5, mix(C_PLATE, C_WHITE, 0.08f));

  // Parpadeo (y ojos entrecerrados al pensar).
  float open = 1;
  if (blinkStart) {
    const float k = (millis() - blinkStart) / 150.0f;
    if (k >= 1) {
      blinkStart = 0;
      if (doubleBlink) {
        doubleBlink = false;
        nextBlink = millis() + 180;
      }
    } else {
      open = 1 - sinf(k * PI);
    }
  }
  const int ey = 102 + (int)breathe;
  eye(78, ey, true, cur == Expr::Think ? min(open, 0.62f) : open);
  eye(162, ey, false, open);

  if (cur == Expr::Happy || cur == Expr::Star) {
    spr.fillEllipse(56, ey + 42, 12, 7, C_BLUSH);
    spr.fillEllipse(184, ey + 42, 12, 7, C_BLUSH);
  }
  drawMouth(120, 172 + (int)breathe);

  if (cur == Expr::Think) {
    for (int i = 0; i < 3; i++) {
      const bool on = ((int)(t * 3) % 4) > i;
      spr.fillSmoothCircle(178 + i * 12, 54 - i * 9, 3 + i, on ? C_LED : C_RIM);
    }
  } else if (cur == Expr::Sleep) {
    spr.setTextColor(C_GREY, C_PLATE);
    spr.setTextDatum(MC_DATUM);
    const float k = fmodf(t * 0.6f, 1.0f);
    spr.drawString("z", 168 + k * 10, 70 - k * 22, 4);
    spr.drawString("Z", 186 + k * 8, 46 - k * 14, 2);
  }

  drawRing();

  // Punto de estado arriba: verde = plataforma, ámbar = solo Wi-Fi, gris = sin conexión.
  const uint16_t dot = linkState == 2 ? C_GREEN : linkState == 1 ? C_AMBER : C_GREY;
  spr.fillSmoothCircle(120, 10, 3, dot);

  if (cardUntil && millis() < cardUntil) drawCard();
  else if (cardUntil) cardUntil = 0;

  spr.pushSprite(0, 0);
}

void update() {
  const uint32_t now = millis();
  if (now - lastFrame < 33) return;
  lastFrame = now;
  Lock l;
  const float dt = min(0.1f, (now - lastTick) / 1000.0f);
  lastTick = now;
  t += dt;

  if (holdUntil && now > holdUntil) {
    holdUntil = 0;
    cur = Expr::Neutral;
  }

  // Mirada: lo que pide la computadora o vistazos al azar, como si observara el salón.
  float tx, ty;
  if (now < lookUntil) {
    tx = lookX;
    ty = lookY;
  } else if (cur == Expr::Think) {
    tx = 0.6f;
    ty = -0.65f;
  } else if (cur == Expr::Listen) {
    tx = 0;
    ty = -0.25f;
  } else {
    if (now > nextSaccade) {
      nextSaccade = now + 1200 + random(2600);
      lookX = (random(100) - 50) / 90.0f;
      lookY = (random(100) - 50) / 140.0f;
      if (talking) {
        lookX *= 0.4f;
        lookY *= 0.4f;
      }
    }
    tx = lookX;
    ty = lookY;
  }
  eyeX += (tx - eyeX) * min(1.0f, dt * 12);
  eyeY += (ty - eyeY) * min(1.0f, dt * 12);

  if (cur != Expr::Sleep && !blinkStart && now > nextBlink) {
    blinkStart = now;
    doubleBlink = random(100) < 20;
    nextBlink = now + 2500 + random(3500);
  }

  // Boca: sílabas propias mientras habla + golpes de voz que manda la computadora.
  float target = pulseLevel;
  if (talking) {
    sylPhase += dt * sylRate * PI;
    if (sylPhase > PI) {
      sylPhase -= PI;
      sylRate = 3.4f + random(180) / 100.0f;
      sylPause = random(100) < 12;
    }
    const float syl = sylPause ? 0.05f : 0.2f + 0.65f * powf(fabsf(sinf(sylPhase)), 0.7f);
    target = max(target, syl);
  }
  pulseLevel = max(0.0f, pulseLevel - dt * 5.5f);
  const float k = target > mouth ? min(1.0f, dt * 28) : min(1.0f, dt * 16);
  mouth += (target - mouth) * k;

  render();
}

}  // namespace face
