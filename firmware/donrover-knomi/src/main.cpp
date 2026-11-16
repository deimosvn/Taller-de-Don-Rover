// Don Rover · asistente físico del Taller de Don Rover (BIGTREETECH KNOMI v1 y otras placas
// ESP32 con pantalla redonda GC9A01; ver platformio.ini).
//
// La pantalla redonda muestra la cara de Don Rover. La computadora del profesor (la plataforma
// en el navegador) habla por las bocinas, escucha con el micrófono y le dice a la placa qué cara
// poner y cuándo mover la boca. Protocolo: una línea JSON por mensaje, igual por los tres caminos
// (USB, Wi-Fi local y nube). Ver firmware/donrover-knomi/README.md.
//
//   Computadora → placa                       Placa → computadora
//   {"t":"hello"}                             {"t":"hi","fw","id","wifi","ip","cloud",…}
//   {"t":"face","e":"happy","ms":3000}        {"t":"btn","k":"short"|"long"}
//   {"t":"talk","on":1}  {"t":"m","v":70}     {"t":"bye"} (al reiniciarse)
//   {"t":"look","x":-40,"y":10}
//   {"t":"ring","p":350,"c":"#FFC93C"}  {"t":"pulse","c":"#B69CFF"}
//   {"t":"card","title":"ABCD","sub":"…","ms":8000}
//   {"t":"bl","v":200}  {"t":"invert","on":1}  {"t":"wifi","ssid","pass"}  {"t":"forget"}
//   {"t":"app","url"}  {"t":"ping"}  {"t":"reboot"}

#include <Arduino.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#if defined(TOUCH_CST816S)
#include <Wire.h>
#endif

#include "face.h"
#include "net.h"

#define FW_VERSION "1.1.0"

#ifndef BOARD_ID
#define BOARD_ID "knomi"
#endif
#ifndef DISPLAY_INVERT
#define DISPLAY_INVERT 1
#endif

static String line;
static volatile uint32_t lastHost[3] = {0, 0, 0};
static uint32_t pressAt = 0;
static bool pressed = false, longSent = false, infoSent = false;
static bool wasLinked = false;
static uint32_t idleSince = 0;
static uint8_t shownLink = 255;

static bool hostLinked() {
  const uint32_t now = millis();
  for (uint8_t i = 0; i < 3; i++)
    if (lastHost[i] && now - lastHost[i] < 12000) return true;
  return false;
}

/** Manda un evento a la plataforma por todos los caminos. */
static void emit(const String &json) {
  Serial.println(json);
  net::send(json);
}

static bool inverted = DISPLAY_INVERT;

static String hello() {
  const String st = net::status();
  String out = "{\"t\":\"hi\",\"fw\":\"" FW_VERSION "\",\"name\":\"Don Rover\",\"board\":\"" BOARD_ID "\",\"inv\":";
  out += inverted ? "1" : "0";
  out += ",\"face\":\"";
  out += exprName(face::expr());
  out += "\"";
  if (st.length() > 2) out += "," + st.substring(1);
  else out += "}";
  return out;
}

static void handle(const String &raw, Source src) {
  JsonDocument doc;
  if (deserializeJson(doc, raw)) return;
  lastHost[src] = millis();
  const char *t = doc["t"] | "";

  if (!strcmp(t, "hello")) {
    emit(hello());
    if (face::expr() == Expr::Sleep) face::setExpr(Expr::Happy, 2500);
  } else if (!strcmp(t, "ping")) {
    // Solo mantiene viva la conexión.
  } else if (!strcmp(t, "face")) {
    face::setExpr(exprFromName(doc["e"] | "neutral"), doc["ms"] | 0);
  } else if (!strcmp(t, "talk")) {
    face::setTalking(doc["on"].as<int>() != 0 || doc["on"].as<bool>());
  } else if (!strcmp(t, "m")) {
    face::mouthPulse((doc["v"] | 0) / 100.0f);
  } else if (!strcmp(t, "look")) {
    face::look((doc["x"] | 0) / 100.0f, (doc["y"] | 0) / 100.0f);
  } else if (!strcmp(t, "ring")) {
    const int p = doc["p"] | -1;
    face::ring(p < 0 ? -1.0f : p / 1000.0f, face::parseColor(doc["c"] | "#7FDBFF", 0x7FFF));
  } else if (!strcmp(t, "pulse")) {
    const char *c = doc["c"] | "";
    face::pulse(c[0] ? face::parseColor(c, 0) : 0);
  } else if (!strcmp(t, "card")) {
    face::card(String(doc["title"] | ""), String(doc["sub"] | ""), doc["ms"] | 0);
  } else if (!strcmp(t, "invert")) {
    // Para módulos que se ven con los colores al revés: se guarda en la placa.
    inverted = doc["on"].as<int>() != 0 || doc["on"].as<bool>();
    face::invert(inverted);
    Preferences p;
    p.begin("donrover", false);
    p.putBool("inv", inverted);
    p.end();
    emit(hello());
  } else if (!strcmp(t, "bl")) {
    face::brightness(constrain((int)(doc["v"] | 200), 10, 255));
  } else if (!strcmp(t, "wifi")) {
    const String ssid = doc["ssid"] | "";
    if (ssid.length()) {
      net::setWifi(ssid, String(doc["pass"] | ""));
      face::card("Wi-Fi", "Conectando a " + ssid, 4000);
    }
  } else if (!strcmp(t, "forget")) {
    net::forget();
  } else if (!strcmp(t, "app")) {
    net::setApp(String(doc["url"] | ""));
  } else if (!strcmp(t, "reboot")) {
    emit("{\"t\":\"bye\"}");
    delay(150);
    ESP.restart();
  }
}

/** Tarjeta con los datos para conectar la placa (botón sin computadora o pulsación muy larga). */
static void showInfo() {
  JsonDocument st;
  deserializeJson(st, net::status());
  const String wifi = st["wifi"] | "off";
  String sub;
  if (wifi == "ok") sub = String("IP ") + (st["ip"] | "") + " · " + (st["ssid"] | "");
  else if (wifi == "portal") sub = String("Conectate a la red ") + (st["ap"] | "") + " para elegir el Wi-Fi";
  else sub = "Conectame por USB a la computadora del profe";
  face::card(net::id(), sub, 9000);
}

static void readSerial() {
  while (Serial.available()) {
    const char c = Serial.read();
    if (c == '\n') {
      line.trim();
      if (line.startsWith("{")) handle(line, SRC_USB);
      line = "";
    } else if (c != '\r' && line.length() < 1024) {
      line += c;
    }
  }
}

#if defined(TOUCH_CST816S)
/* Pantalla táctil CST816S (ESP32-2424S012): tocar la cara es como presionar el botón. */
static bool touchReady = false;

static void touchBegin() {
  pinMode(TOUCH_RST, OUTPUT);
  digitalWrite(TOUCH_RST, LOW);
  delay(10);
  digitalWrite(TOUCH_RST, HIGH);
  delay(60);
  touchReady = Wire.begin(TOUCH_SDA, TOUCH_SCL, 400000);
}

static bool touchDown() {
  static uint32_t at = 0;
  static bool last = false;
  if (!touchReady || millis() - at < 25) return last;
  at = millis();
  // Registro 0x02: número de dedos. Si el chip está dormido no contesta (= sin toque).
  Wire.beginTransmission(0x15);
  Wire.write(0x02);
  if (Wire.endTransmission(false) != 0 || Wire.requestFrom(0x15, 1) != 1) return last = false;
  return last = (Wire.read() & 0x0F) > 0;
}
#else
static bool touchDown() { return false; }
#endif

/** Botón de Don Rover (BOOT): corto = ayuda / repetir · largo = hablar con Don Rover. */
static void readButton() {
  const bool down = digitalRead(PIN_BUTTON) == LOW || touchDown();
  const uint32_t now = millis();
  if (down && !pressed) {
    pressed = true;
    pressAt = now;
    longSent = infoSent = false;
    face::setExpr(Expr::Wow, 350);
  } else if (down && pressed) {
    if (!longSent && now - pressAt > 700) {
      longSent = true;
      if (hostLinked()) {
        emit("{\"t\":\"btn\",\"k\":\"long\"}");
        face::setExpr(Expr::Listen, 1500);
      }
    }
    if (!infoSent && now - pressAt > 5000) {
      infoSent = true;
      showInfo();
    }
  } else if (!down && pressed) {
    pressed = false;
    if (now - pressAt < 700) {
      if (hostLinked()) emit("{\"t\":\"btn\",\"k\":\"short\"}");
      else showInfo();
    }
  }
}

void setup() {
  Serial.setRxBufferSize(2048);
  Serial.begin(115200);
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  {
    Preferences p;
    p.begin("donrover", true);
    inverted = p.getBool("inv", DISPLAY_INVERT);
    p.end();
  }
  face::begin(inverted);
#if defined(TOUCH_CST816S)
  touchBegin();
#endif
  net::begin(handle);
  face::card("Hola!", "Soy Don Rover. Conectame a la plataforma.", 3500);
  delay(200);
  emit(hello());
  idleSince = millis();
}

void loop() {
  readSerial();
  readButton();

  const bool linked = hostLinked();
  const uint8_t link = linked ? 2 : net::online();
  if (link != shownLink) {
    shownLink = link;
    face::status(link);
  }
  if (linked && !wasLinked) {
    face::setExpr(Expr::Happy, 2500);
  } else if (!linked && wasLinked) {
    // Se fue la plataforma: deja de hablar y se calma.
    face::setTalking(false);
    face::ring(-1, 0);
    face::pulse(0);
    idleSince = millis();
  }
  wasLinked = linked;
  // Sin plataforma por un rato: se duerme (cualquier mensaje lo despierta).
  if (!linked && face::expr() == Expr::Neutral && millis() - idleSince > 90000) face::setExpr(Expr::Sleep);

  if (net::changed()) emit(hello());
  face::update();
  delay(1);
}
