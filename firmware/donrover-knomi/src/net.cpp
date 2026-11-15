#include "net.h"

#include <ArduinoJson.h>
#include <DNSServer.h>
#include <ESPmDNS.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <WebServer.h>
#include <WebSocketsClient.h>
#include <WebSocketsServer.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>

namespace net {

enum class Wifi : uint8_t { Off, Connecting, Online };

static CommandHandler handler = nullptr;
static Preferences prefs;
static String wifiSsid, wifiPass, appUrl, boardId;
static WebServer http(80);
static DNSServer dns;
static WebSocketsServer ws(81);
static WebSocketsClient relay;
static Wifi state = Wifi::Off;
static bool portal = false, serversUp = false, dirty = true;
static uint32_t connectStart = 0;

// Canal en la nube (Supabase Realtime, protocolo Phoenix en JSON).
static String relayKey, relayTopic;
static bool relayStarted = false, relayJoined = false, relayNoConfig = false;
static uint32_t relayRetryAt = 0, heartbeatAt = 0, refCounter = 1;

static const char *DEFAULT_APP = "https://tallerdedonrover.vercel.app";

static void applyWifi(const String &s, const String &p);

// Comunicación con las otras tareas: cola de salida, operaciones pendientes y estado copiado.
static QueueHandle_t outbox = nullptr;
static SemaphoreHandle_t mu = nullptr;
static String pendSsid, pendPass, pendApp, statusCache = "{}";
static bool pendWifi = false, pendForget = false;
static volatile bool changedFlag = true;
static volatile uint8_t onlineFlag = 0;
static volatile bool remoteFlag = false;

const String &id() { return boardId; }

static String ip() { return state == Wifi::Online ? WiFi.localIP().toString() : (portal ? WiFi.softAPIP().toString() : String("")); }

bool changed() {
  const bool d = changedFlag;
  changedFlag = false;
  return d;
}

uint8_t online() { return onlineFlag; }
bool remoteLinked() { return remoteFlag; }

String status() {
  xSemaphoreTake(mu, portMAX_DELAY);
  String s = statusCache;
  xSemaphoreGive(mu);
  return s;
}

const char *wifiState() {
  if (state == Wifi::Online) return "ok";
  if (portal) return "portal";
  if (state == Wifi::Connecting) return "connecting";
  return "off";
}

const char *cloudState() {
  if (relayJoined) return "on";
  if (relayNoConfig) return "nocfg";
  if (relayStarted) return "connecting";
  return "off";
}

/* ---------------- páginas ---------------- */

static String esc(const String &s) {
  String o;
  for (char c : s) {
    if (c == '<') o += "&lt;";
    else if (c == '>') o += "&gt;";
    else if (c == '&') o += "&amp;";
    else if (c == '"') o += "&quot;";
    else o += c;
  }
  return o;
}

static void page() {
  String h;
  h.reserve(2600);
  h += F("<!doctype html><html lang=es><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
         "<title>Don Rover</title><style>body{font-family:system-ui,sans-serif;background:#170806;color:#fff8ec;margin:0;padding:24px;}"
         "main{max-width:420px;margin:auto}h1{margin:0 0 4px}p{color:#d9cbbf;line-height:1.45}"
         "label{display:block;margin:14px 0 6px;font-weight:600}input{width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #6b3f33;background:#2b100b;color:#fff8ec;font-size:16px}"
         "button{margin-top:18px;width:100%;padding:14px;border:0;border-radius:12px;background:#f08a57;color:#2a120d;font-weight:700;font-size:16px}"
         ".card{background:#2b100b;border-radius:14px;padding:12px 14px;margin:16px 0}code{color:#7fdbff}</style><main>"
         "<h1>&#129302; Don Rover</h1><p>Asistente de la colonia del Taller de Don Rover.</p><div class=card>");
  h += "Placa <code>" + boardId + "</code><br>Wi-Fi: <b>" + String(wifiState()) + "</b>";
  if (state == Wifi::Online) h += " · " + esc(wifiSsid) + " · IP <code>" + WiFi.localIP().toString() + "</code>";
  h += "<br>Nube: <b>" + String(cloudState()) + "</b></div>";
  h += F("<form method=post action=/wifi><label for=s>Red Wi-Fi (la misma de la computadora del profe)</label><input id=s name=ssid required maxlength=32 value='");
  h += esc(wifiSsid);
  h += F("'><label for=p>Contraseña</label><input id=p name=pass type=password maxlength=64><button>Guardar y conectar</button></form>"
         "<p>Después abre la plataforma, entra a <b>Don Rover</b> y elige <b>Wi-Fi</b> con el código de esta placa.</p></main></html>");
  http.send(200, "text/html; charset=utf-8", h);
}

static void cors() {
  http.sendHeader("Access-Control-Allow-Origin", "*");
  http.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  http.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  // Chrome pide permiso antes de que una página pública hable con un equipo de la red local.
  http.sendHeader("Access-Control-Allow-Private-Network", "true");
}

static String statusJson() {
  JsonDocument d;
  d["id"] = boardId;
  d["wifi"] = wifiState();
  d["ssid"] = wifiSsid;
  d["ip"] = ip();
  d["cloud"] = cloudState();
  d["app"] = appUrl;
  d["ap"] = "DonRover-" + boardId;
  String out;
  serializeJson(d, out);
  return out;
}

static void startServers() {
  if (serversUp) return;
  serversUp = true;
  http.on("/", HTTP_GET, page);
  http.on("/wifi", HTTP_POST, [] {
    const String s = http.arg("ssid"), p = http.arg("pass");
    if (!s.length()) {
      http.send(400, "text/plain; charset=utf-8", "Falta el nombre de la red.");
      return;
    }
    http.send(200, "text/html; charset=utf-8",
              "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'><body style='font-family:system-ui;background:#170806;color:#fff8ec;padding:24px'>"
              "<h2>Conectando a " + esc(s) + "…</h2><p>Don Rover mostrará su carita feliz cuando esté en línea. Ya puedes volver a tu red.</p>");
    delay(300);
    applyWifi(s, p);
  });
  http.on("/status", HTTP_GET, [] {
    cors();
    http.send(200, "application/json", statusJson());
  });
  http.on("/cmd", HTTP_OPTIONS, [] {
    cors();
    http.send(204);
  });
  http.on("/status", HTTP_OPTIONS, [] {
    cors();
    http.send(204);
  });
  http.on("/cmd", HTTP_POST, [] {
    cors();
    const String body = http.arg("plain");
    if (handler && body.length() && body.length() < 2048) handler(body, SRC_WIFI);
    http.send(200, "application/json", statusJson());
  });
  // Detección de portal cautivo (Android, iPhone, Windows): todo lleva a la página de configuración.
  auto toRoot = [] {
    http.sendHeader("Location", String("http://") + WiFi.softAPIP().toString() + "/", true);
    http.send(302, "text/plain", "");
  };
  http.on("/generate_204", toRoot);
  http.on("/hotspot-detect.html", toRoot);
  http.on("/connecttest.txt", toRoot);
  http.on("/ncsi.txt", toRoot);
  http.onNotFound([] {
    if (portal) {
      http.sendHeader("Location", String("http://") + WiFi.softAPIP().toString() + "/", true);
      http.send(302, "text/plain", "");
    } else {
      http.send(404, "text/plain", "No encontrado");
    }
  });
  http.begin();

  ws.begin();
  ws.onEvent([](uint8_t num, WStype_t type, uint8_t *payload, size_t len) {
    if (type == WStype_TEXT && handler && len < 2048) handler(String((const char *)payload, len), SRC_WIFI);
  });
}

static void startMdns() {
  MDNS.end();
  if (MDNS.begin("donrover")) {
    MDNS.addService("http", "tcp", 80);
    MDNS.addService("ws", "tcp", 81);
  }
}

static void startPortal() {
  if (portal) return;
  portal = true;
  WiFi.mode(wifiSsid.length() ? WIFI_AP_STA : WIFI_AP);
  WiFi.softAP(("DonRover-" + boardId).c_str());
  dns.start(53, "*", WiFi.softAPIP());
  startServers();
  startMdns();
  dirty = true;
}

static void stopPortal() {
  if (!portal) return;
  portal = false;
  dns.stop();
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_STA);
  dirty = true;
}

static void connect() {
  if (!wifiSsid.length()) return;
  WiFi.mode(portal ? WIFI_AP_STA : WIFI_STA);
  WiFi.setHostname("donrover");
  WiFi.begin(wifiSsid.c_str(), wifiPass.c_str());
  state = Wifi::Connecting;
  connectStart = millis();
  dirty = true;
}

/* ---------------- canal en la nube ---------------- */

static void relaySendRaw(const String &msg) { relay.sendTXT(msg.c_str(), msg.length()); }

static void relayJoin() {
  JsonDocument d;
  d["topic"] = relayTopic;
  d["event"] = "phx_join";
  JsonObject cfg = d["payload"]["config"].to<JsonObject>();
  cfg["broadcast"]["self"] = false;
  cfg["broadcast"]["ack"] = false;
  cfg["presence"]["key"] = "";
  cfg["postgres_changes"].to<JsonArray>();
  cfg["private"] = false;
  d["payload"]["access_token"] = relayKey;
  d["ref"] = "1";
  d["join_ref"] = "1";
  String out;
  serializeJson(d, out);
  relaySendRaw(out);
}

static void relayEvent(WStype_t type, uint8_t *payload, size_t len) {
  switch (type) {
    case WStype_CONNECTED:
      relayJoined = false;
      relayJoin();
      heartbeatAt = millis() + 25000;
      break;
    case WStype_DISCONNECTED:
      if (relayJoined) dirty = true;
      relayJoined = false;
      break;
    case WStype_TEXT: {
      JsonDocument d;
      if (deserializeJson(d, payload, len)) return;
      const char *ev = d["event"] | "";
      if (!strcmp(ev, "phx_reply") && d["ref"] == "1") {
        relayJoined = !strcmp(d["payload"]["status"] | "", "ok");
        dirty = true;
      } else if (!strcmp(ev, "broadcast")) {
        JsonVariant p = d["payload"];
        if (!strcmp(p["event"] | "", "c") && handler) {
          String cmd;
          serializeJson(p["payload"], cmd);
          handler(cmd, SRC_CLOUD);
        }
      }
      break;
    }
    default:
      break;
  }
}

/** Pide a la plataforma la configuración pública del canal (URL de Supabase y clave anon). */
static void relayStart() {
  relayRetryAt = millis() + 120000;
  if (!appUrl.startsWith("https://")) return;
  WiFiClientSecure tls;
  tls.setInsecure();
  HTTPClient req;
  req.setTimeout(8000);
  if (!req.begin(tls, appUrl + "/api/realtime")) return;
  const int code = req.GET();
  if (code != 200) {
    req.end();
    return;
  }
  JsonDocument d;
  const DeserializationError err = deserializeJson(d, req.getString());
  req.end();
  if (err) return;
  if (!(d["enabled"] | false)) {
    relayNoConfig = true;
    dirty = true;
    return;
  }
  String url = d["url"] | "";
  relayKey = String(d["key"] | "");
  url.replace("https://", "");
  url.replace("http://", "");
  while (url.endsWith("/")) url.remove(url.length() - 1);
  if (!url.length() || !relayKey.length()) return;
  relayTopic = "realtime:donrover-bot-" + boardId;
  const String path = "/realtime/v1/websocket?apikey=" + relayKey + "&vsn=1.0.0";
  relay.beginSSL(url.c_str(), 443, path.c_str(), "", "");
  relay.onEvent(relayEvent);
  relay.setReconnectInterval(5000);
  relay.enableHeartbeat(20000, 5000, 2);
  relayStarted = true;
  relayNoConfig = false;
  dirty = true;
}

static void relayStop() {
  if (relayStarted) relay.disconnect();
  relayStarted = relayJoined = false;
  relayRetryAt = millis() + 2000;
}

void send(const String &json) {
  if (!outbox) return;
  char *copy = strdup(json.c_str());
  if (copy && xQueueSend(outbox, &copy, 0) != pdTRUE) free(copy);
}

static void deliver(const String &json) {
  if (serversUp) ws.broadcastTXT(json.c_str(), json.length());
  if (relayJoined) {
    String msg;
    msg.reserve(json.length() + relayTopic.length() + 120);
    msg += "{\"topic\":\"" + relayTopic + "\",\"event\":\"broadcast\",\"payload\":{\"type\":\"broadcast\",\"event\":\"e\",\"payload\":";
    msg += json;
    msg += "},\"ref\":\"" + String(++refCounter) + "\",\"join_ref\":\"1\"}";
    relaySendRaw(msg);
  }
}

/* ---------------- ciclo ---------------- */

static void applyForget();
static void applyApp(const String &url);
static void tick();

static void task(void *) {
  prefs.begin("donrover", false);
  wifiSsid = prefs.getString("ssid", "");
  wifiPass = prefs.getString("pass", "");
  appUrl = prefs.getString("app", DEFAULT_APP);
  WiFi.persistent(false);
  WiFi.setAutoReconnect(true);
  if (wifiSsid.length()) connect();
  else startPortal();
  for (;;) {
    tick();
    vTaskDelay(pdMS_TO_TICKS(2));
  }
}

void begin(CommandHandler h) {
  handler = h;
  char buf[8];
  snprintf(buf, sizeof buf, "%06X", (uint32_t)(ESP.getEfuseMac() >> 24) & 0xFFFFFF);
  boardId = buf;
  outbox = xQueueCreate(32, sizeof(char *));
  mu = xSemaphoreCreateMutex();
  xTaskCreatePinnedToCore(task, "net", 12288, nullptr, 2, nullptr, 0);
}

void setWifi(const String &s, const String &p) {
  xSemaphoreTake(mu, portMAX_DELAY);
  pendSsid = s;
  pendPass = p;
  pendWifi = true;
  xSemaphoreGive(mu);
}

void forget() {
  xSemaphoreTake(mu, portMAX_DELAY);
  pendForget = true;
  xSemaphoreGive(mu);
}

void setApp(const String &url) {
  xSemaphoreTake(mu, portMAX_DELAY);
  pendApp = url;
  xSemaphoreGive(mu);
}

static void applyWifi(const String &s, const String &p) {
  wifiSsid = s.substring(0, 32);
  wifiPass = p.substring(0, 64);
  prefs.putString("ssid", wifiSsid);
  prefs.putString("pass", wifiPass);
  relayStop();
  WiFi.disconnect(false, false);
  connect();
}

static void applyForget() {
  prefs.remove("ssid");
  prefs.remove("pass");
  wifiSsid = wifiPass = "";
  relayStop();
  WiFi.disconnect(true, true);
  state = Wifi::Off;
  startPortal();
}

static void applyApp(const String &url) {
  if (!url.startsWith("https://") && !url.startsWith("http://")) return;
  String u = url;
  while (u.endsWith("/")) u.remove(u.length() - 1);
  if (u == appUrl) return;
  appUrl = u;
  prefs.putString("app", appUrl);
  relayStop();
  relayNoConfig = false;
}

static void tick() {
  // Operaciones que pidieron las otras tareas.
  xSemaphoreTake(mu, portMAX_DELAY);
  const bool doWifi = pendWifi, doForget = pendForget;
  const String s = pendSsid, p = pendPass, a = pendApp;
  pendWifi = pendForget = false;
  pendApp = "";
  xSemaphoreGive(mu);
  if (doWifi) applyWifi(s, p);
  if (doForget) applyForget();
  if (a.length()) applyApp(a);

  // Mensajes para la plataforma.
  char *msg = nullptr;
  while (xQueueReceive(outbox, &msg, 0) == pdTRUE) {
    deliver(String(msg));
    free(msg);
  }

  const uint32_t now = millis();
  const bool up = WiFi.status() == WL_CONNECTED;

  if (state == Wifi::Connecting && up) {
    state = Wifi::Online;
    startServers();
    startMdns();
    if (portal) stopPortal();
    relayRetryAt = now + 1500;
    dirty = true;
  } else if (state == Wifi::Online && !up) {
    state = Wifi::Connecting;
    connectStart = now;
    relayJoined = false;
    dirty = true;
  } else if (state == Wifi::Connecting && !portal && now - connectStart > 25000) {
    // No hay red: se abre el portal para corregir la contraseña (y se sigue intentando).
    startPortal();
  }

  if (portal) dns.processNextRequest();
  if (serversUp) {
    http.handleClient();
    ws.loop();
  }
  if (state == Wifi::Online) {
    if (!relayStarted && !relayNoConfig && now > relayRetryAt) relayStart();
    if (relayStarted) {
      relay.loop();
      if (relayJoined && now > heartbeatAt) {
        heartbeatAt = now + 25000;
        relaySendRaw("{\"topic\":\"phoenix\",\"event\":\"heartbeat\",\"payload\":{},\"ref\":\"" + String(++refCounter) + "\"}");
      }
    }
  }

  onlineFlag = state == Wifi::Online ? 1 : 0;
  remoteFlag = (serversUp && ws.connectedClients() > 0) || relayJoined;
  if (dirty) {
    dirty = false;
    const String st = statusJson();
    xSemaphoreTake(mu, portMAX_DELAY);
    statusCache = st;
    xSemaphoreGive(mu);
    changedFlag = true;
  }
}

}  // namespace net
