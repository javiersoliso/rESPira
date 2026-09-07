/* ============================================================================
 *  rESPira · provisionamiento de WiFi  —  se conecta solo
 * ============================================================================
 *  ORDEN DE ARRANQUE (una sola pasada, sin esperas ciegas):
 *    1. Escanea el sitio UNA VEZ (antes de que nadie se conecte: es el unico
 *       momento en que el escaneo es fiable y no molesta). La lista sirve
 *       tambien para el portal.
 *    2. Prueba la red GUARDADA si esta a la vista.
 *    3. Prueba las redes CONOCIDAS (tabla CANDIDATAS de abajo) que esten a la
 *       vista. La que funcione queda guardada como preferida.
 *    4. Si el escaneo vino vacio (pasa a veces), prueba a ciegas: guardada y
 *       luego conocidas.
 *    5. Si nada: AP "Respira-ESP32" con portal. En el portal puedes elegir de
 *       la lista O ESCRIBIR EL NOMBRE A MANO (unirse nunca necesito verla).
 *
 *  LECCIONES DE RENDIMIENTO (a base de latencias de 7000 ms):
 *    - Escanear con un movil ya conectado al AP falla casi siempre y ademas
 *      saca la radio del canal (el AP "desaparece", el WebSocket se congela).
 *      Por eso el unico escaneo automatico es el del arranque.
 *    - Nada de reintentos de escaneo en bucle: eran peores que la enfermedad.
 *    - WiFi.setSleep(false): el ahorro de energia metia jitter de cientos de ms.
 * ========================================================================== */
#pragma once
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <ESPmDNS.h>
#include <Preferences.h>

namespace red {

// Las credenciales NO viven aqui. Estan en redes.h, que esta en el .gitignore.
// Copia redes.h.ejemplo a redes.h y pon las tuyas: asi este fichero se puede
// publicar y cada quien compila con sus propias redes.
#include "redes.h"

struct Candidata { const char* ssid; const char* pass; };
const Candidata CANDIDATAS[] = REDES_CONOCIDAS;
const int N_CANDIDATAS = sizeof(CANDIDATAS) / sizeof(CANDIDATAS[0]);

Preferences prefs;
DNSServer dns;
bool modoAP = false;
String ipActual = "";
String redActual = "";

// ---------------------------------------------------- escaneo con cache ---
String opcionesHtml = "";      // <option>...</option> del ultimo escaneo bueno
bool   escaneando   = false;   // hay un escaneo asincrono en marcha
uint32_t ultimoKickMs = 0;

void construirOpciones(int n) {
  if (n <= 0) return;
  if (n > 20) n = 20;
  String s;
  s.reserve(n * 64);
  for (int i = 0; i < n; i++) {
    s += F("<option value=\"");
    s += WiFi.SSID(i);
    s += F("\">");
    s += WiFi.SSID(i);
    s += F("  (");
    s += WiFi.RSSI(i);
    s += F(" dBm)</option>");
  }
  opcionesHtml = s;
}

// Asincrono, solo si lo pide el usuario ("Buscar redes otra vez"). Con el
// movil conectado al AP puede fallar o volver vacio: no pasa nada, la cache
// anterior se conserva y el campo manual siempre esta ahi.
void lanzarEscaneo(bool forzar) {
  if (escaneando) return;
  uint32_t ahora = millis();
  if (!forzar && (uint32_t)(ahora - ultimoKickMs) < 20000) return;
  ultimoKickMs = ahora;
  WiFi.scanNetworks(true, false, false, 150);
  escaneando = true;
}

// Se llama desde atender(): recoge el resultado del asincrono si lo hay.
void recogerEscaneo() {
  if (!escaneando) return;
  int n = WiFi.scanComplete();
  if (n == WIFI_SCAN_RUNNING) return;
  escaneando = false;
  construirOpciones(n);          // si fallo (n<=0) se queda la lista anterior
  WiFi.scanDelete();
}

// ------------------------------------------------------------ portal HTML ---
const char PORTAL_CAB[] PROGMEM = R"H(<!doctype html><html lang=es><head>
<meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>rESPira · WiFi</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0f14;color:#dfe8ef;font:16px/1.5 system-ui,sans-serif;padding:18px}
h1{font-size:14px;letter-spacing:.18em;color:#5fd3a6;margin-bottom:4px}
p.s{font-size:13px;color:#8ea5b8;margin-bottom:16px}
.card{background:#111a22;border:1px solid #1e2c38;border-radius:12px;padding:14px;margin-bottom:12px}
label{display:block;font-size:12px;color:#6b8296;margin-bottom:6px;text-transform:uppercase;letter-spacing:.1em}
select,input{width:100%;background:#0a1219;color:#dfe8ef;border:1px solid #2a4152;
  border-radius:8px;padding:12px;font-size:16px;margin-bottom:12px}
button{width:100%;background:#5fd3a6;color:#06210f;border:0;border-radius:8px;
  padding:14px;font-size:16px;font-weight:700}
a{color:#7fb8dd;font-size:13px}
.n{font-size:13px;color:#8ea5b8;margin-top:10px}
.aviso{font-size:12.5px;color:#e0a34a;margin-bottom:12px}
</style></head><body><h1>rESPIRA · WIFI</h1>
<p class=s>Elige la red de este sitio, o escribe su nombre a mano. Se guarda en el ESP32 y no hay que volver a hacerlo.</p>
<form method=POST action="/wifi/guardar"><div class=card>
<label>Red de la lista</label><select name=ssid>)H";

const char PORTAL_PIE[] PROGMEM = R"H(</select>
<label>O escribe el nombre a mano</label>
<input name=ssid2 placeholder="tal cual, respetando mayúsculas" autocapitalize=none autocorrect=off>
<div class=aviso>El ESP32 solo ve redes de 2,4 GHz. Si la tuya acaba en _5G,
usa su hermana sin _5G. Si escribes el nombre a mano, no hace falta que
salga en la lista.</div>
<label>Contraseña</label><input name=pass type=password placeholder="(vacío si es abierta)">
<button type=submit>Guardar y conectar</button>
<p class=n>El ESP32 se reiniciará. Si la contraseña falla, vuelve a levantar este portal.</p>
</div></form>
<div class=card><a href="/wifi/buscar">Buscar redes otra vez</a><br>
<a href="/">Seguir sin conectar (usar solo este AP)</a><br>
<a href="/wifi/olvidar">Olvidar la red guardada</a></div>
</body></html>)H";

// ------------------------------------------------------------------ pagina ---
// Sirve SIEMPRE de la cache: aqui no se escanea nunca.
void servirPortal(WebServer &http) {
  String s;
  s.reserve(3600);
  s += FPSTR(PORTAL_CAB);
  if (opcionesHtml.length() == 0) {
    s += F("<option value=\"\">-- no veo redes: escríbela abajo --</option>");
  } else {
    s += F("<option value=\"\">-- elige una red --</option>");
    s += opcionesHtml;
  }
  s += FPSTR(PORTAL_PIE);
  http.send(200, "text/html", s);
}

void buscarOtraVez(WebServer &http) {
  lanzarEscaneo(true);
  http.send(200, "text/html",
    "<meta charset=utf-8><meta http-equiv=refresh content=\"4;url=/wifi\">"
    "<body style='background:#0a0f14;color:#8ea5b8;font:16px system-ui;padding:30px'>"
    "Buscando redes... (con el móvil conectado al AP a veces no encuentra "
    "ninguna: en ese caso escribe el nombre a mano)</body>");
}

void guardar(WebServer &http) {
  String ssid = http.arg("ssid2");     // el campo manual manda
  ssid.trim();
  if (ssid.length() == 0) { ssid = http.arg("ssid"); ssid.trim(); }
  String pass = http.arg("pass");
  if (ssid.length() == 0) {
    http.send(200, "text/html",
      "<meta charset=utf-8><body style='background:#0a0f14;color:#e0a34a;"
      "font:16px system-ui;padding:30px'>Falta la red: elige una de la lista "
      "o escribe su nombre a mano.<br><br><a style='color:#7fb8dd' "
      "href='/wifi'>Volver</a></body>");
    return;
  }
  prefs.begin("respira", false);
  prefs.putString("ssid", ssid);
  prefs.putString("pass", pass);
  prefs.end();
  http.send(200, "text/html",
    "<meta charset=utf-8><body style='background:#0a0f14;color:#5fd3a6;"
    "font:17px system-ui;padding:30px'>Guardado. Reiniciando…<br><br>"
    "<span style='color:#8ea5b8;font-size:14px'>Vuelve a tu WiFi normal y abre "
    "<b>http://respira.local</b></span></body>");
  delay(600);
  ESP.restart();
}

void olvidar(WebServer &http) {
  prefs.begin("respira", false);
  prefs.remove("ssid");
  prefs.remove("pass");
  prefs.end();
  http.send(200, "text/html",
    "<meta charset=utf-8><body style='background:#0a0f14;color:#e8a33d;"
    "font:17px system-ui;padding:30px'>Red olvidada. Reiniciando…</body>");
  delay(600);
  ESP.restart();
}

// ------------------------------------------------------------------ union ---
bool vista(const String &ssid, int n) {
  for (int i = 0; i < n; i++) if (WiFi.SSID(i) == ssid) return true;
  return false;
}

bool unirse(const String &ssid, const String &pass) {
  Serial.printf("# probando '%s'", ssid.c_str());
  WiFi.begin(ssid.c_str(), pass.c_str());
  for (int i = 0; i < 20 && WiFi.status() != WL_CONNECTED; i++) {
    delay(400); Serial.print('.');
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) return true;
  WiFi.disconnect();
  delay(150);
  return false;
}

// ------------------------------------------------------------------ arranque ---
// Devuelve true si quedo unido a una red de verdad (modo estacion).
bool iniciar() {
  prefs.begin("respira", true);
  String nSsid = prefs.getString("ssid", "");
  String nPass = prefs.getString("pass", "");
  prefs.end();

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);            // sin ahorro de energia: latencia estable
  WiFi.setHostname(HOSTNAME);

  // Escaneo UNICO de arranque: decide que probar, y de paso deja hecha la
  // lista del portal por si acabamos en modo AP.
  Serial.println("# mirando que redes hay (2-4 s)...");
  int n = WiFi.scanNetworks();
  construirOpciones(n);
  Serial.printf("# veo %d redes\n", n > 0 ? n : 0);

  bool unido = false;
  String usada = "", usadaPass = "";

  // 1. la guardada, si esta a la vista
  if (nSsid.length() > 0 && vista(nSsid, n) && unirse(nSsid, nPass)) {
    unido = true; usada = nSsid; usadaPass = nPass;
  }
  // 2. las conocidas que esten a la vista
  for (int i = 0; !unido && i < N_CANDIDATAS; i++) {
    if (nSsid == CANDIDATAS[i].ssid) continue;        // ya probada
    if (!vista(CANDIDATAS[i].ssid, n)) continue;
    if (unirse(CANDIDATAS[i].ssid, CANDIDATAS[i].pass)) {
      unido = true; usada = CANDIDATAS[i].ssid; usadaPass = CANDIDATAS[i].pass;
    }
  }
  // 3. si el escaneo vino vacio, a ciegas (unirse no necesita ver la red)
  if (!unido && n <= 0) {
    if (nSsid.length() > 0 && unirse(nSsid, nPass)) {
      unido = true; usada = nSsid; usadaPass = nPass;
    }
    for (int i = 0; !unido && i < N_CANDIDATAS; i++) {
      if (nSsid == CANDIDATAS[i].ssid) continue;
      if (unirse(CANDIDATAS[i].ssid, CANDIDATAS[i].pass)) {
        unido = true; usada = CANDIDATAS[i].ssid; usadaPass = CANDIDATAS[i].pass;
      }
    }
  }
  WiFi.scanDelete();

  if (unido) {
    WiFi.setSleep(false);          // por si begin() lo reactivo
    modoAP = false;
    ipActual = WiFi.localIP().toString();
    redActual = usada;
    if (usada != nSsid) {          // la que funciona queda como preferida
      prefs.begin("respira", false);
      prefs.putString("ssid", usada);
      prefs.putString("pass", usadaPass);
      prefs.end();
    }
    if (MDNS.begin(HOSTNAME)) MDNS.addService("http", "tcp", 80);
    Serial.printf("# EN '%s'  ->  http://%s   (o http://%s.local)\n",
                  usada.c_str(), ipActual.c_str(), HOSTNAME);
    Serial.println("# el movil conserva internet: puedes mandar capturas");
    return true;
  }

  // ---- nada: AP con portal (la lista ya esta hecha del escaneo de arriba) ---
  Serial.println("# ninguna red conocida por aqui; levanto el portal");
  WiFi.mode(WIFI_AP_STA);
  WiFi.setSleep(false);
  WiFi.softAP(AP_SSID, AP_PASS);
  modoAP = true;
  ipActual = WiFi.softAPIP().toString();
  redActual = AP_SSID;
  dns.start(53, "*", WiFi.softAPIP());       // portal cautivo
  Serial.printf("# AP '%s'  ->  http://%s\n", AP_SSID, ipActual.c_str());
  Serial.println("# conecta el movil a esa red: el portal se abre solo");
  return false;
}

void rutas(WebServer &http) {
  http.on("/wifi", [&http]() { servirPortal(http); });
  http.on("/wifi/buscar", [&http]() { buscarOtraVez(http); });
  http.on("/wifi/guardar", HTTP_POST, [&http]() { guardar(http); });
  http.on("/wifi/olvidar", [&http]() { olvidar(http); });
}

void atender() {
  if (modoAP) dns.processNextRequest();
  recogerEscaneo();
}

}  // namespace red
