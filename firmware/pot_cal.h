/* ============================================================================
 *  rESPira · calibracion y modelado del potenciometro
 * ============================================================================
 *  El pot se topa en 97 % por dos motivos reales, no por un fallo:
 *    - Los potenciometros tienen resistencia residual en los extremos: el cursor
 *      nunca llega al final de la pista. Es normal y varia de una unidad a otra.
 *    - El ADC del ESP32 no es lineal cerca de los raíles: comprime abajo (zona
 *      muerta por debajo de ~0,15 V) y satura arriba.
 *  Por eso hay que MEDIR los topes de TU pot, no suponerlos.
 *
 *  Ademas del recorrido, aqui se modela la CURVA. Cinco puntos de control
 *  reparten el mapeo de recorrido fisico a "porcentaje de pulmon", porque no
 *  hay ninguna razon para que tu percepcion de llenado sea lineal respecto al
 *  giro de la mano. La ley de potencia de Stevens dice mas bien lo contrario, y
 *  esa era una de las incognitas abiertas del documento de diseno (U8).
 *
 *  Todo se guarda en la NVS: sobrevive a reinicios y a subir firmware nuevo.
 * ========================================================================== */
#pragma once
#include <WebServer.h>
#include <Preferences.h>

namespace pot {

const int NPTS = 5;                    // puntos de control, en x = 0/25/50/75/100
uint16_t vmin = 0, vmax = 4095;
uint8_t  curva[NPTS] = { 0, 25, 50, 75, 100 };   // lineal por defecto
bool     invertido = false;
uint16_t ultimoRaw = 0;

void cargar() {
  Preferences p;
  p.begin("pot", true);
  vmin = p.getUShort("min", 0);
  vmax = p.getUShort("max", 4095);
  invertido = p.getBool("inv", false);
  for (int i = 0; i < NPTS; i++) {
    char k[8]; snprintf(k, sizeof(k), "c%d", i);
    curva[i] = p.getUChar(k, (uint8_t)(i * 100 / (NPTS - 1)));
  }
  p.end();
  if (vmax <= vmin + 50) { vmin = 0; vmax = 4095; }   // salvaguarda
}

void guardar() {
  Preferences p;
  p.begin("pot", false);
  p.putUShort("min", vmin);
  p.putUShort("max", vmax);
  p.putBool("inv", invertido);
  for (int i = 0; i < NPTS; i++) {
    char k[8]; snprintf(k, sizeof(k), "c%d", i);
    p.putUChar(k, curva[i]);
  }
  p.end();
}

/* Crudo del ADC -> porcentaje modelado.
   1) recorta al recorrido medido, 2) normaliza, 3) invierte si toca,
   4) interpola en la curva de 5 puntos. */
float aplicar(uint16_t raw) {
  ultimoRaw = raw;
  if (raw < vmin) raw = vmin;
  if (raw > vmax) raw = vmax;
  float t = (float)(raw - vmin) / (float)(vmax - vmin);   // 0..1
  if (invertido) t = 1.0f - t;

  float pos = t * (NPTS - 1);
  int i = (int)pos;
  if (i >= NPTS - 1) return curva[NPTS - 1];
  float f = pos - i;
  return curva[i] + (curva[i + 1] - curva[i]) * f;
}

// ------------------------------------------------------------------ pagina ---
const char PAGINA[] PROGMEM = R"H(<!doctype html><html lang=es><head>
<meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>rESPira · pot</title><style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-user-select:none;user-select:none}
body{background:#0a0f14;color:#dfe8ef;font:15px/1.5 system-ui,sans-serif;padding:12px}
h1{font-size:13px;letter-spacing:.18em;color:#3ba3ff;margin-bottom:10px}
.c{background:#111a22;border:1px solid #1e2c38;border-radius:12px;padding:14px;margin-bottom:10px}
.k{font-size:10px;letter-spacing:.14em;color:#6b8296;text-transform:uppercase;margin-bottom:8px}
.v{font-size:30px;font-weight:700;font-variant-numeric:tabular-nums}
.u{font-size:13px;color:#6b8296}
.row{display:flex;gap:8px;align-items:center}
.row>*{flex:1}
button{background:#1b2b38;color:#9fd8c0;border:1px solid #2a4152;border-radius:9px;
  padding:13px 8px;font-size:14px;font-weight:600}
button.p{background:#3ba3ff;color:#04121f;border-color:#3ba3ff}
button.g{background:#5fd3a6;color:#06210f;border-color:#5fd3a6}
canvas{width:100%;height:260px;display:block;touch-action:none;border-radius:10px;background:#0a1219}
.bar{height:20px;background:#0a1219;border-radius:10px;overflow:hidden;margin-top:8px}
.bar i{display:block;height:100%;background:linear-gradient(90deg,#1d6fc0,#3ba3ff)}
.sm{font-size:12px;color:#8ea5b8;font-variant-numeric:tabular-nums}
a{color:#7fb8dd}
</style></head><body>
<h1>POTENCIÓMETRO · CALIBRAR Y MODELAR</h1>

<div class=c><div class=k>Ahora mismo</div>
  <div class=row>
    <div><div class=sm>crudo del ADC</div><div class=v id=raw>--</div></div>
    <div><div class=sm>modelado</div><div class=v id=pct>--<span class=u>%</span></div></div>
  </div>
  <div class=bar><i id=b style=width:0%></i></div>
</div>

<div class=c><div class=k>1 · Recorrido real de tu pot</div>
  <div class=sm>Gira al tope de abajo y fija el mínimo. Al tope de arriba y fija el máximo.</div>
  <div class=row style=margin-top:10px>
    <button onclick="fijar('min')">Fijar mínimo<br><span class=sm id=vmin>--</span></button>
    <button onclick="fijar('max')">Fijar máximo<br><span class=sm id=vmax>--</span></button>
  </div>
  <div class=row style=margin-top:8px>
    <button onclick="inv()">Invertir sentido</button>
  </div>
</div>

<div class=c><div class=k>2 · La curva</div>
  <div class=sm>Arrastra los cinco puntos. Izquierda = pulmón vacío, derecha = lleno.
    El punto azul eres tú ahora mismo.</div>
  <canvas id=cv></canvas>
  <div class=row style=margin-top:10px>
    <button onclick="preset('lin')">Lineal</button>
    <button onclick="preset('sq')">Fondo fino</button>
    <button onclick="preset('sc')">Centro fino</button>
  </div>
</div>

<div class=c>
  <button class=g style=width:100% onclick=guardar()>Guardar en el ESP32</button>
  <div class=sm id=msg style=margin-top:8px>&nbsp;</div>
  <div style=margin-top:10px><a href="/">← volver a la medición</a></div>
</div>

<script>
const $=i=>document.getElementById(i);
let st={min:0,max:4095,inv:false,c:[0,25,50,75,100]},raw=0;
const cv=$('cv'),cx=cv.getContext('2d');let W,H;const PAD=26;
function fit(){W=cv.width=cv.clientWidth*2;H=cv.height=cv.clientHeight*2;dib()}
addEventListener('resize',fit);

const X=i=>PAD+i/(st.c.length-1)*(W-2*PAD);
const Y=v=>H-PAD-(v/100)*(H-2*PAD);

function dib(){
  cx.clearRect(0,0,W,H);
  cx.strokeStyle='#1a2733';cx.lineWidth=2;
  for(let g=0;g<=4;g++){const y=PAD+g/4*(H-2*PAD);
    cx.beginPath();cx.moveTo(PAD,y);cx.lineTo(W-PAD,y);cx.stroke();
    const x=PAD+g/4*(W-2*PAD);
    cx.beginPath();cx.moveTo(x,PAD);cx.lineTo(x,H-PAD);cx.stroke()}
  // diagonal de referencia (lo que seria lineal)
  cx.strokeStyle='#243542';cx.setLineDash([8,8]);cx.beginPath();
  cx.moveTo(X(0),Y(0));cx.lineTo(X(st.c.length-1),Y(100));cx.stroke();cx.setLineDash([]);
  // curva
  cx.strokeStyle='#3ba3ff';cx.lineWidth=5;cx.beginPath();
  st.c.forEach((v,i)=>i?cx.lineTo(X(i),Y(v)):cx.moveTo(X(i),Y(v)));cx.stroke();
  // puntos
  st.c.forEach((v,i)=>{cx.fillStyle='#dfe8ef';cx.beginPath();
    cx.arc(X(i),Y(v),13,0,7);cx.fill();
    cx.fillStyle='#0a1219';cx.font='bold 18px system-ui';cx.textAlign='center';
    cx.fillText(v,X(i),Y(v)+6)});
  // donde estas ahora
  let t=(raw-st.min)/Math.max(1,st.max-st.min);t=Math.max(0,Math.min(1,t));
  if(st.inv)t=1-t;
  const px=PAD+t*(W-2*PAD),py=Y(evalua(t));
  cx.strokeStyle='#5fd3a6';cx.lineWidth=3;cx.setLineDash([5,5]);
  cx.beginPath();cx.moveTo(px,H-PAD);cx.lineTo(px,py);cx.lineTo(PAD,py);cx.stroke();
  cx.setLineDash([]);
  cx.fillStyle='#5fd3a6';cx.beginPath();cx.arc(px,py,11,0,7);cx.fill();
}
function evalua(t){const p=t*(st.c.length-1),i=Math.floor(p);
  if(i>=st.c.length-1)return st.c[st.c.length-1];
  return st.c[i]+(st.c[i+1]-st.c[i])*(p-i)}

let arr=-1;
function pos(e){const r=cv.getBoundingClientRect(),
  t=e.touches?e.touches[0]:e;
  return{x:(t.clientX-r.left)*2,y:(t.clientY-r.top)*2}}
function down(e){const p=pos(e);let mej=-1,d=1e9;
  st.c.forEach((v,i)=>{const dd=Math.hypot(X(i)-p.x,Y(v)-p.y);if(dd<d){d=dd;mej=i}});
  if(d<70)arr=mej;e.preventDefault()}
function move(e){if(arr<0)return;const p=pos(e);
  let v=Math.round((H-PAD-p.y)/(H-2*PAD)*100);
  v=Math.max(0,Math.min(100,v));
  st.c[arr]=v;
  // la curva de un volumen no puede bajar: forzamos que no decrezca
  for(let i=arr+1;i<st.c.length;i++)if(st.c[i]<st.c[i-1])st.c[i]=st.c[i-1];
  for(let i=arr-1;i>=0;i--)if(st.c[i]>st.c[i+1])st.c[i]=st.c[i+1];
  dib();e.preventDefault()}
function up(){arr=-1}
cv.addEventListener('touchstart',down,{passive:false});
cv.addEventListener('touchmove',move,{passive:false});
cv.addEventListener('touchend',up);
cv.addEventListener('mousedown',down);
cv.addEventListener('mousemove',e=>{if(arr>=0)move(e)});
addEventListener('mouseup',up);

function preset(k){
  if(k=='lin')st.c=[0,25,50,75,100];
  if(k=='sq') st.c=[0,12,32,62,100];   // mas resolucion abajo (vaciado fino)
  if(k=='sc') st.c=[0,18,50,82,100];   // mas resolucion en el centro
  dib()}
function fijar(q){fetch('/pot/fijar?q='+q).then(r=>r.json()).then(e=>{
  st.min=e.min;st.max=e.max;pinta();dib();
  $('msg').textContent='Tope '+(q=='min'?'mínimo':'máximo')+' fijado en '+
    (q=='min'?e.min:e.max)})}
function inv(){st.inv=!st.inv;$('msg').textContent='Sentido '+(st.inv?'invertido':'normal')
  +' (recuerda guardar)';dib()}
function pinta(){$('vmin').textContent=st.min;$('vmax').textContent=st.max}
function guardar(){
  const q='/pot/guardar?min='+st.min+'&max='+st.max+'&inv='+(st.inv?1:0)
    +'&c='+st.c.join(',');
  fetch(q).then(r=>r.text()).then(()=>{$('msg').textContent='Guardado en el ESP32 ✓'})
    .catch(()=>{$('msg').textContent='No se pudo guardar'})}

function tick(){fetch('/pot/raw').then(r=>r.json()).then(e=>{
  raw=e.raw;$('raw').textContent=e.raw;
  $('pct').innerHTML=e.pct.toFixed(0)+'<span class=u>%</span>';
  $('b').style.width=e.pct+'%';dib()}).catch(()=>{})}

fetch('/pot/estado').then(r=>r.json()).then(e=>{
  st.min=e.min;st.max=e.max;st.inv=e.inv;st.c=e.c;pinta();fit();
  setInterval(tick,120)});
</script></body></html>)H";

// ------------------------------------------------------------------- rutas ---
void rutas(WebServer &http, uint16_t (*leerCrudo)()) {
  http.on("/pot", [&http]() { http.send_P(200, "text/html", PAGINA); });

  http.on("/pot/estado", [&http]() {
    String s = "{\"min\":" + String(vmin) + ",\"max\":" + String(vmax) +
               ",\"inv\":" + (invertido ? "true" : "false") + ",\"c\":[";
    for (int i = 0; i < NPTS; i++) { if (i) s += ','; s += curva[i]; }
    s += "]}";
    http.send(200, "application/json", s);
  });

  http.on("/pot/raw", [&http, leerCrudo]() {
    uint16_t r = leerCrudo();
    String s = "{\"raw\":" + String(r) + ",\"pct\":" + String(aplicar(r), 1) + "}";
    http.send(200, "application/json", s);
  });

  http.on("/pot/fijar", [&http, leerCrudo]() {
    uint16_t r = leerCrudo();
    if (http.arg("q") == "min") vmin = r; else vmax = r;
    if (vmax <= vmin + 50) {          // no dejamos que se crucen
      if (http.arg("q") == "min") vmin = (vmax > 50) ? vmax - 50 : 0;
      else vmax = vmin + 50;
    }
    guardar();
    http.send(200, "application/json",
              "{\"min\":" + String(vmin) + ",\"max\":" + String(vmax) + "}");
  });

  http.on("/pot/guardar", [&http]() {
    if (http.hasArg("min")) vmin = http.arg("min").toInt();
    if (http.hasArg("max")) vmax = http.arg("max").toInt();
    if (http.hasArg("inv")) invertido = (http.arg("inv") == "1");
    if (http.hasArg("c")) {
      String c = http.arg("c");
      int i = 0, ini = 0;
      while (i < NPTS) {
        int coma = c.indexOf(',', ini);
        String v = (coma < 0) ? c.substring(ini) : c.substring(ini, coma);
        curva[i++] = (uint8_t)constrain(v.toInt(), 0, 100);
        if (coma < 0) break;
        ini = coma + 1;
      }
    }
    if (vmax <= vmin + 50) { vmin = 0; vmax = 4095; }
    guardar();
    http.send(200, "text/plain", "ok");
  });
}

}  // namespace pot
