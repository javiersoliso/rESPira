/* ============================================================================
 *  rESPira · EL PULSO COMO ESPECTRO
 * ============================================================================
 *  El mismo lenguaje visual que el espectro de la voz, pero el eje vertical no
 *  son hercios: son LATIDOS POR MINUTO. De 35 a 190.
 *
 *  Tu ritmo cardiaco aparece como una linea brillante. Y aqui esta lo bueno:
 *  esa linea NO es recta. Sube al inhalar y baja al exhalar — eso es la
 *  arritmia sinusal respiratoria, el acoplamiento entre respiracion y corazon
 *  que es la tesis entera de este proyecto. Normalmente hay que calcularla.
 *  Aqui se ve.
 *
 *  Debajo, en el mismo eje de tiempo, la traza del potenciometro. Asi puedes
 *  mirar las dos a la vez y ver si tu linea de pulso ondula al ritmo de tu
 *  mano. Cuanto mas ancha sea la onda del corazon, mas RSA tienes.
 *
 *  Todo el calculo se hace en el navegador (Goertzel sobre una ventana de unos
 *  40 s). El ESP32 solo manda las muestras, como siempre.
 *
 *  v9.1: mismo lenguaje visual que el panel y la vela (/ui.css), y la
 *  grabacion sigue viva tambien aqui (/grabar.js). El aqua es el pulso y el
 *  azul el pulmon en las tres paginas, asi que la lectura se transfiere.
 * ========================================================================== */
#pragma once

static const char PULSO[] PROGMEM = R"HTML(<!doctype html><html lang=es><head>
<meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>rESPira · pulso</title><link rel=stylesheet href="/ui.css">
</head><body>
<div class=wrap>
<div class=g>
  <div class="card w"><div class=fila>
    <div><div class=k>Pulso</div>
      <span class="v xl c-pulso" id=bpm>--</span><span class=u> lpm</span><i class=late id=late></i></div>
    <div style=text-align:center><div class=k>Pulmón</div>
      <span class="v c-pulmon" id=pot>--</span><span class=u>%</span></div>
    <div style=text-align:right><div class=k>RSA · anchura</div>
      <span class="v c-vela" id=rsa>--</span><span class=u> lpm</span>
      <div class=nota id=rsaRango></div>
      <div class=sm id=est>conectando…</div></div>
  </div></div>

  <div class="card w"><div class=k>Latidos por minuto · la línea ondula con tu respiración</div>
    <canvas id=esp height=340></canvas>
    <div class=nota style=margin-top:7px>
      Cuanto más ancha sea la banda brillante, más arritmia sinusal respiratoria
      tienes. La línea clara es el latido que marca el firmware; las dos marcas
      doradas son hasta dónde ha llegado tu ritmo en el último minuto, que es
      lo que mide el número de RSA de arriba. Subestima algo el recorrido real
      (la ventana de 8 s promedia los extremos), así que úsalo para comparar
      una sesión con otra, no como una cifra absoluta.</div></div>

  <div class="card w"><div class=k>Pulmón y pulso, mismo eje de tiempo</div>
    <canvas id=cop height=110></canvas>
    <div class=nota style=margin-top:7px>
      Azul = tu mano en el potenciómetro. Aqua = tu ritmo cardíaco.
      Si el aqua sube cuando el azul sube, ahí está el acoplamiento.</div></div>

  <div class="card w">
    <div class=k>Sesión</div>
    <div class=sm id=sesest>—</div>
    <a class="btn rec" id=bgrab href=# onclick="Rec.alterna(Rec.etiqueta()||'pulso');return false">● Grabar</a>
  </div>
</div></div>
<script src="/grabar.js"></script>
<script>
barra('/pulso');
const BPM_MIN=35, BPM_MAX=190, FILAS=124;
/* Ventana de analisis: 40 SEGUNDOS, sea cual sea la frecuencia de muestreo.
   Antes era N=1024 fijo, que a 25 Hz eran ~40 s pero a 100 Hz son solo 10:
   demasiado poco para resolver la ondulacion respiratoria del ritmo. El buffer
   se dimensiona para el peor caso y solo se analiza la cola que hace 40 s. */
const N=4096;
const SEG_ANALISIS=40;    // espectrograma: resolucion fina
const SEG_CORTO=8;       // seguimiento del pico: mas corto que una respiracion
const $=i=>document.getElementById(i);
const ce=$('esp'),xe=ce.getContext('2d');
const cc=$('cop'),xc=cc.getContext('2d');
let W,H,CW,CH;
function fit(){const d=Math.min(devicePixelRatio||1,2);
  W=ce.width=ce.clientWidth*d;H=ce.height=340*d;
  CW=cc.width=cc.clientWidth*d;CH=cc.height=110*d}
addEventListener('resize',fit);fit();

// frecuencias de cada fila, repartidas linealmente en lpm
const filas=[];
for(let i=0;i<FILAS;i++) filas.push(BPM_MIN+(BPM_MAX-BPM_MIN)*i/(FILAS-1));
const yDe=b=>H-(b-BPM_MIN)/(BPM_MAX-BPM_MIN)*H;

const buf=new Float32Array(N); let escritos=0;
let fs=25, tUlt=Date.now(), nMuestras=0;
// la ventana de Hann se recalcula cuando cambia la fs medida
let NA=0, hann=new Float32Array(0), vista=new Float32Array(0);
let NCA=0, hannC=new Float32Array(0), vistaC=new Float32Array(0);
function ajustaVentana(){
  const n=Math.max(256, Math.min(N, Math.round(fs*SEG_ANALISIS)));
  if(n===NA) return;
  NA=n; hann=new Float32Array(NA); vista=new Float32Array(NA);
  for(let i=0;i<NA;i++) hann[i]=0.5-0.5*Math.cos(2*Math.PI*i/(NA-1));
}
ajustaVentana();
let bpmAct=0, potAct=0, rsa=0, rsaLo=0, rsaHi=0;
const histPico=[];              // pico del espectro en el ultimo minuto
const histP=[], histB=[];           // para la tira de abajo

/* Goertzel: magnitud del espectro en UNA frecuencia concreta, en O(N) y con
   tres operaciones por muestra. Mucho mas barato que una FFT entera cuando
   solo interesan 124 frecuencias elegidas a mano. */
function goertzel(x, w, f, fsHz){
  const k = 2*Math.PI*f/fsHz, coef = 2*Math.cos(k);
  let s1=0, s2=0;
  for(let i=0;i<x.length;i++){
    const s0 = x[i]*w[i] + coef*s1 - s2;
    s2=s1; s1=s0;
  }
  return Math.sqrt(Math.max(0, s1*s1 + s2*s2 - coef*s1*s2));
}
function analizar(){
  ajustaVentana();
  if(escritos<NA/3) return;                   // aun no hay historia suficiente
  vista.set(buf.subarray(N-NA));              // la cola: los ultimos 40 s
  const mag=new Float32Array(FILAS);
  let mx=0;
  for(let i=0;i<FILAS;i++){
    mag[i]=goertzel(vista, hann, filas[i]/60, fs);
    if(mag[i]>mx) mx=mag[i];
  }
  if(mx<=0) return;

  /* --------------------------- CUANTA RSA TIENES ---------------------------
     Ojo con el metodo, porque aqui hay una trampa de fondo. El espectrograma
     de arriba usa 40 s de ventana: eso da buena resolucion en frecuencia pero
     promedia CUATRO ciclos respiratorios, asi que su pico NO se mueve con la
     respiracion. Un espectro de 40 s no puede ver la RSA por definicion.

     Asi que se hace un SEGUNDO analisis, corto (8 s), solo para seguir el pico.
     8 s es mas corto que un ciclo respiratorio normal, asi que el pico si sube
     y baja con el. A cambio la resolucion bruta es peor, y por eso se busca en
     paso fino alrededor del pico largo y se interpola en parabola.

     La RSA es entonces el RECORRIDO de ese pico en el ultimo minuto, con
     percentiles 10 y 90 para que un analisis malo no dispare el numero.

     Lo que NO se hace: medir la anchura del lobulo. Se probo y esta mal por dos
     motivos. Uno, el 2o ARMONICO de tu pulso (a ~124 lpm si late a 62) cae
     dentro del rango 35-190 que dibuja esta pagina, y el ancho acababa yendo
     del fundamental al armonico: salian 113 lpm de RSA. Dos, aunque se mida
     solo el lobulo central, una modulacion lenta no ensancha el pico sino que
     crea bandas laterales separadas, asi que el ancho SUBESTIMA el recorrido.
     ---------------------------------------------------------------------- */
  let pl=0; for(let i=1;i<FILAS;i++) if(mag[i]>mag[pl]) pl=i;
  const centro=filas[pl];

  const NC=Math.min(escritos, Math.round(fs*SEG_CORTO));
  if(NC>=Math.round(fs*4)){
    if(NC!==NCA){ NCA=NC; hannC=new Float32Array(NCA); vistaC=new Float32Array(NCA);
      for(let i=0;i<NCA;i++) hannC[i]=0.5-0.5*Math.cos(2*Math.PI*i/(NCA-1)); }
    vistaC.set(buf.subarray(N-NCA));
    let mejor=centro, mx2=-1;
    for(let b=centro-24; b<=centro+24; b+=0.75){
      if(b<BPM_MIN||b>BPM_MAX) continue;
      const g=goertzel(vistaC, hannC, b/60, fs);
      if(g>mx2){ mx2=g; mejor=b; }
    }
    // parabola con los dos vecinos, para bajar del paso de 0,75 lpm
    const g0=goertzel(vistaC,hannC,(mejor-0.75)/60,fs);
    const g2=goertzel(vistaC,hannC,(mejor+0.75)/60,fs);
    const den=g0-2*mx2+g2;
    if(Math.abs(den)>1e-12) mejor += Math.max(-1,Math.min(1,0.5*(g0-g2)/den))*0.75;

    histPico.push(mejor);
    if(histPico.length>120) histPico.shift();       // 120 x 0,5 s = 1 min
    if(histPico.length>=20){
      const o=[...histPico].sort((a,b)=>a-b);
      rsaLo=o[Math.floor(o.length*0.10)];
      rsaHi=o[Math.floor(o.length*0.90)];
      rsa=rsaHi-rsaLo;
    }
  }

  const d=Math.min(devicePixelRatio||1,2), paso=3*d, alto=H/FILAS;
  xe.drawImage(ce,-paso,0);
  xe.fillStyle='#05070a'; xe.fillRect(W-paso,0,paso,H);
  for(let i=0;i<FILAS;i++){
    const v=Math.sqrt(mag[i]/mx); if(v<0.08) continue;
    const y=H-(i+1)*alto;
    /* rampa secuencial de UN solo tono (el aqua del pulso), de oscuro a claro.
       Antes era una rampa de rojos que no tenia nada que ver con el color del
       pulso en el resto de la app. Un solo tono ademas se lee como magnitud;
       una rampa de varios se lee como categorias, que aqui seria mentira.  */
    const l=Math.min(78,8+v*72), sa=Math.max(45,90-v*35);
    xe.fillStyle=`hsl(${162-v*4} ${sa}% ${l}%)`;
    xe.fillRect(W-paso,y,paso,alto+0.7);
  }
  // el recorrido del ultimo minuto, para que se vea de donde sale el numero
  if(rsaHi>rsaLo){
    xe.fillStyle='rgba(240,185,60,.5)';
    xe.fillRect(W-paso, yDe(rsaHi)-d*0.5, paso, d);
    xe.fillRect(W-paso, yDe(rsaLo)-d*0.5, paso, d);
  }
  if(bpmAct>=BPM_MIN&&bpmAct<=BPM_MAX){       // el latido que dice el firmware
    xe.fillStyle='#e3ecf4';
    xe.fillRect(W-paso, yDe(bpmAct)-1.5*d, paso, 3*d);
  }
  $('rsa').textContent = rsa ? rsa.toFixed(0) : '--';
  $('rsaRango').textContent = rsa ? (rsaLo.toFixed(0)+'-'+rsaHi.toFixed(0)+' lpm') : '';
}

function tira(){
  const d=Math.min(devicePixelRatio||1,2);
  xc.clearRect(0,0,CW,CH);
  const n=histP.length; if(n<2) return;
  const X=i=>i/(n-1)*CW;
  // pulmon, como area azul
  xc.beginPath(); xc.moveTo(0,CH);
  for(let i=0;i<n;i++) xc.lineTo(X(i), CH-histP[i]/100*CH*0.94);
  xc.lineTo(CW,CH); xc.closePath();
  xc.fillStyle='rgba(57,135,229,0.32)'; xc.fill();
  // pulso, linea blanca, escalado a su propio rango
  let mn=1e9,mx=-1e9;
  for(const b of histB) if(b>0){ if(b<mn)mn=b; if(b>mx)mx=b; }
  if(mx-mn<6){const c=(mx+mn)/2; mn=c-3; mx=c+3;}
  xc.beginPath(); let prim=true;
  for(let i=0;i<n;i++){
    if(!histB[i]) continue;
    const y=CH-(histB[i]-mn)/(mx-mn)*CH*0.9-CH*0.05;
    prim ? (xc.moveTo(X(i),y), prim=false) : xc.lineTo(X(i),y);
  }
  xc.strokeStyle='#3fd39c'; xc.lineWidth=2*d; xc.stroke();
}

let ws=null, dotT=0;
function conectar(){
  ws=new WebSocket('ws://'+location.hostname+':81/');
  ws.onopen=()=>{$('est').textContent='en vivo';$('est').className='sm c-bien'};
  ws.onclose=()=>{$('est').textContent='reconectando…';$('est').className='sm c-ojo';
    setTimeout(conectar,1000)};
  ws.onerror=()=>{try{ws.close()}catch(e){}};
  ws.onmessage=e=>{
    const d=JSON.parse(e.data);
    if(d.pong!==undefined) return;
    Rec.push(d);                      // <-- la grabacion tambien sigue aqui
    if(d.ac&&d.ac.length){
      for(const v of d.ac){
        buf.copyWithin(0,1); buf[N-1]=v; escritos++;
      }
      nMuestras+=d.ac.length;
    }
    bpmAct = d.bm||0; potAct = d.p;
    $('bpm').textContent = d.f&&d.bm ? d.bm : '--';
    $('pot').textContent = d.p;
    if(d.beat && Date.now()-dotT>150){dotT=Date.now();
      $('late').classList.add('on'); setTimeout(()=>$('late').classList.remove('on'),120)}
  };
}
/* fs: desde v9 el ESP32 la publica en /cfg.txt, asi que no hay que deducirla
   de la hora de llegada de los mensajes (que llevaba el jitter de la red).
   Si /cfg.txt no responde, se sigue contando como antes. */
let fsFirme=false;
fetch('/cfg.txt').then(r=>r.text()).then(t=>{
  const m=t.match(/fs_fifo=(\d+)/);
  if(m){ fs=+m[1]; fsFirme=true; ajustaVentana(); }
}).catch(()=>{});
setInterval(()=>{
  const dt=(Date.now()-tUlt)/1000;
  if(!fsFirme && dt>0 && nMuestras>0){ fs = fs*0.7 + (nMuestras/dt)*0.3; }
  nMuestras=0; tUlt=Date.now();
},2000);
setInterval(()=>{ analizar(); }, 500);
setInterval(()=>{
  histP.push(potAct); histB.push(bpmAct);
  if(histP.length>240){histP.shift(); histB.shift();}   // 240 x 0,5 s = 2 min
  tira();
}, 500);
Rec.alCambiar((a,n)=>{ $('bgrab').textContent=a?'■ Parar':'● Grabar';
  $('bgrab').className=a?'btn':'btn rec';
  $('sesest').innerHTML = a ? ('GRABANDO · <b>'+n.toLocaleString('es-ES')+'</b> filas')
                            : (n? ('parada · '+n+' filas') : 'lista para grabar'); });
conectar();
</script></body></html>)HTML";
