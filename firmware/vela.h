/* ============================================================================
 *  rESPira · LA VELA  —  biofeedback sin numeros
 * ============================================================================
 *  Inhalar (el pot sube)  -> el aire entra hacia ti: la llama se estira y se
 *                            afina, el humo sube en columna apretada.
 *  Exhalar (el pot baja)  -> viento. La llama se tumba y el humo sale volando.
 *                            Cuanto mas brusco exhalas, mas se tumba: si
 *                            exhalas de golpe, CASI LA APAGAS.
 *  Sostener               -> la llama se aquieta y se pone vertical.
 *  Cada latido            -> un pulso de brillo en el nucleo y una onda que
 *                            recorre la elipse de luz del suelo.
 *
 *  La gracia esta en el castigo: soplar fuerte apaga la vela. Una espiracion
 *  lenta y pareja la mantiene viva y bailando.
 *
 *  v9.1: usa /ui.css y /grabar.js como las demas paginas. Eso significa que
 *  PUEDES SEGUIR GRABANDO aqui: empiezas en el panel, te vienes a la vela, y
 *  la sesion continua — el estado vive en IndexedDB, no en la pagina. Y si te
 *  acuerdas ya estando aqui, el boton de grabar tambien esta.
 * ========================================================================== */
#pragma once

static const char VELA[] PROGMEM = R"HTML(<!doctype html><html lang=es><head>
<meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1,user-scalable=no">
<title>rESPira · vela</title><link rel=stylesheet href="/ui.css"><style>
html,body{height:100%;overflow:hidden;background:#05070a}
body{padding:0}
.top{background:rgba(5,7,10,.75);border-bottom-color:#141d27}
#c{position:fixed;inset:0;width:100vw;height:100vh;border-radius:0;background:#05070a}
#hud{position:fixed;left:0;right:0;top:46px;padding:10px 14px;display:flex;
  justify-content:space-between;align-items:flex-start;pointer-events:none;z-index:20}
#hud .b{font-size:26px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.05;
  letter-spacing:-.02em}
#av{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:20;
  color:var(--tx2);font-size:13px;text-align:center;display:none;pointer-events:none}
#pie{position:fixed;left:0;right:0;bottom:0;padding:12px 14px;z-index:20;
  display:flex;justify-content:center;gap:8px}
#pie .btn{margin:0;background:rgba(22,32,43,.8);backdrop-filter:blur(8px)}
</style></head><body>
<canvas id=c></canvas>
<div id=hud>
  <div><div class=k style=margin-bottom:2px>Pulmón</div>
       <span class="b c-pulmon" id=vp>--</span><span class=u>%</span></div>
  <div style=text-align:right><div class=k style=margin-bottom:2px>Pulso</div>
       <span class="b c-pulso" id=vb>--</span><span class=u> lpm</span></div>
</div>
<div id=av>apoya el dedo en el sensor</div>
<div id=pie>
  <a class="btn rec" id=bgrab href=# onclick="Rec.alterna(Rec.etiqueta()||'vela');return false">● Grabar</a>
</div>
<script src="/grabar.js"></script>
<script>
const $=i=>document.getElementById(i);
barra('/vela');
const c=$('c'),x=c.getContext('2d');
let W,H,BX,BY;
function fit(){const d=Math.min(devicePixelRatio||1,2);
  W=c.width=innerWidth*d;H=c.height=innerHeight*d;
  c.style.width=innerWidth+'px';c.style.height=innerHeight+'px';
  BX=W/2;BY=H*0.78}
addEventListener('resize',fit);fit();

// estado del sensor
let vol=0, volAnt=0, dv=0, viento=0, pulso=0, bpm=0, listo=0;
// animacion
let t=0, hum=[], apagon=0;
function Z(){return Math.min(W,H)/420}
function nace(){return{x:BX+(Math.random()-.5)*6*Z(),y:BY-52*Z(),
  vx:0,vy:-(.5+Math.random()*.5)*Z(),vida:1,r:(3+Math.random()*4)*Z(),
  g:Math.random()*6.28}}
for(let i=0;i<70;i++){hum.push(nace());hum[i].vida=Math.random()}

function dibuja(){
  t+=0.016;
  const z=Z();
  viento += ((-dv*0.9) - viento)*0.12;
  const fuerza=Math.min(1,Math.abs(viento)/22);
  apagon += (fuerza - apagon)*0.15;
  pulso *= 0.90;

  x.fillStyle='#05070a';x.fillRect(0,0,W,H);

  // ---------- elipse de luz en el suelo ----------
  const rl=(90+vol*0.9)*z*(1+pulso*0.10);
  let g=x.createRadialGradient(BX,BY+16*z,2,BX,BY+16*z,rl*1.6);
  g.addColorStop(0,'rgba(201,133,0,'+(0.24+pulso*0.24)*(1-apagon*0.6)+')');
  g.addColorStop(.5,'rgba(150,95,10,0.05)');
  g.addColorStop(1,'rgba(0,0,0,0)');
  x.fillStyle=g;x.save();x.translate(BX,BY+16*z);x.scale(1,0.26);
  x.beginPath();x.arc(0,0,rl*1.6,0,6.2832);x.fill();x.restore();
  // el aro late con el corazon, en el aqua del pulso: mismo color que en las
  // otras dos paginas, para que el latido se reconozca sin leer nada
  x.save();x.translate(BX,BY+16*z);x.scale(1,0.26);
  x.strokeStyle='rgba(63,211,156,'+(0.06+pulso*0.42)+')';x.lineWidth=(1.5+pulso*2)*z;
  x.beginPath();x.arc(0,0,rl*(1+pulso*0.5),0,6.2832);x.stroke();x.restore();

  // ---------- humo ----------
  for(const p of hum){
    const sub=p.y/H;
    p.vx += (Math.sin(p.y*0.012+t*1.3+p.g)*0.035 + viento*0.010*(1-sub))*z;
    p.vy += -0.006*z;
    p.x+=p.vx; p.y+=p.vy;
    p.vida -= 0.0042 + fuerza*0.004;
    if(p.vida<=0 || p.y<-20){Object.assign(p,nace())}
    const a=p.vida*0.16*(1-apagon*0.4);
    if(a>0.004){
      x.fillStyle='rgba(150,160,172,'+a+')';
      x.beginPath();x.arc(p.x,p.y,p.r*(2.2-p.vida*1.2),0,6.2832);x.fill();
    }
  }

  // ---------- llama ----------
  const alt=(46+vol*0.55)*z*(1-apagon*0.55)*(1+pulso*0.06);
  const anc=(13+ (100-vol)*0.05)*z*(1-apagon*0.35);
  const lean=viento*0.85*z;
  const bail=Math.sin(t*7.5)*1.6*z*(0.3+fuerza*2.2);

  x.save();x.translate(BX,BY);
  let h=x.createRadialGradient(0,-alt*0.45,1,0,-alt*0.45,alt*2.1);
  h.addColorStop(0,'rgba(240,185,60,'+(0.22+pulso*0.20)*(1-apagon*0.7)+')');
  h.addColorStop(1,'rgba(201,133,0,0)');
  x.fillStyle=h;x.beginPath();x.arc(0,-alt*0.45,alt*2.1,0,6.2832);x.fill();

  x.beginPath();
  x.moveTo(-anc,0);
  x.bezierCurveTo(-anc*1.05,-alt*0.45, lean*0.5-anc*0.75,-alt*0.82, lean+bail,-alt);
  x.bezierCurveTo(lean*0.5+anc*0.75,-alt*0.82, anc*1.05,-alt*0.45, anc,0);
  x.quadraticCurveTo(0,alt*0.10,-anc,0);
  let fg=x.createLinearGradient(0,0,lean,-alt);
  fg.addColorStop(0,'rgba(170,80,5,'+(0.85*(1-apagon*0.6))+')');
  fg.addColorStop(.45,'rgba(201,133,0,'+(0.95*(1-apagon*0.5))+')');
  fg.addColorStop(1,'rgba(240,225,170,'+(0.9*(1-apagon*0.8))+')');
  x.fillStyle=fg;x.fill();

  const na=alt*0.34*(1+pulso*0.30);
  let ng=x.createRadialGradient(lean*0.25,-alt*0.32,1,lean*0.25,-alt*0.32,na);
  ng.addColorStop(0,'rgba(255,250,232,'+(0.95*(1-apagon*0.7))+')');
  ng.addColorStop(.6,'rgba(240,185,60,0.45)');
  ng.addColorStop(1,'rgba(201,133,0,0)');
  x.fillStyle=ng;x.beginPath();x.arc(lean*0.25,-alt*0.32,na,0,6.2832);x.fill();

  x.strokeStyle='rgba(40,34,30,0.9)';x.lineWidth=2*z;
  x.beginPath();x.moveTo(0,4*z);x.lineTo(lean*0.12,-alt*0.16);x.stroke();
  x.restore();

  requestAnimationFrame(dibuja);
}
requestAnimationFrame(dibuja);

let ws=null;
function conectar(){
  ws=new WebSocket('ws://'+location.hostname+':81/');
  ws.onclose=()=>setTimeout(conectar,1000);
  ws.onerror=()=>{try{ws.close()}catch(e){}};
  ws.onmessage=e=>{const d=JSON.parse(e.data);
    if(d.pong!==undefined)return;
    Rec.push(d);                       // <-- la grabacion sigue viva aqui
    volAnt=vol; vol=d.p; dv=vol-volAnt;
    // d.g es la puerta de calidad; d.f solo dice que hay algo delante
    listo=(d.g!==undefined)?d.g:d.f; bpm=d.bm||d.b||0;
    if(d.beat)pulso=1;
    $('vp').textContent=vol;
    $('vb').textContent=listo&&bpm?bpm:'--';
    $('av').textContent=(d.f&&!listo)?'recoloca el dedo · señal débil'
                                     :'apoya el dedo en el sensor';
    $('av').style.display=listo?'none':'block';
  };
}
Rec.alCambiar(a=>{ $('bgrab').textContent=a?'■ Parar':'● Grabar';
                   $('bgrab').className=a?'btn':'btn rec'; });
conectar();
</script></body></html>)HTML";
