/* ============================================================================
 *  rESPira · MOVIL  v9.1  —  FICHERO UNICO
 * ============================================================================
 *  COMO SABER QUE TIENES LA BUENA: el monitor serie dice "MOVIL v9" y la pagina,
 *  arriba del todo, "rESPIRA · MOVIL v9".
 *
 *  v9 no toca NADA de lo que ya funcionaba: WiFi con portal, respira.local,
 *  grabacion en el telefono, /vela, /pulso, calibracion del potenciometro y
 *  perro guardian siguen exactamente igual. Lo que cambia es la cadena de
 *  senal, que ahora vive entera en respira_ppg.h, y la forma de registrar.
 *
 *  DE DONDE SALE ESTO: del analisis de la sesion respira_1785646237992.csv
 *  (403 s, 9878 filas). Todo lo de abajo es una cifra medida, no una suposicion.
 *
 *  1. EL DETECTOR ESTABA CIEGO — 48 latidos de ~217, y el campo `amp` valia 0
 *     el 85 % del tiempo. La causa es un bloqueo mutuo: el umbral salia de la
 *     mediana de las amplitudes ACEPTADAS, y para aceptar una amplitud hacia
 *     falta pasar el umbral. Si se vaciaba el anillo, no habia forma de volver
 *     a llenarlo. Ahora la envolvente se actualiza en TODAS las muestras, con
 *     decaimiento, y la puerta de calidad bloquea la PUBLICACION, nunca el
 *     seguimiento.
 *
 *  2. EL AGC SE DESBOCABA — rampa 0x3C -> 0xFC en 4,8 s y 110 muestras con el
 *     ADC a fondo de escala. La causa exacta: autoGanancia() daba un paso de
 *     0x10 cada 400 ms, pero dcLento es una EMA con alfa 0,02, que a 25 Hz
 *     tarda 2 s en enterarse. En esos 2 s caben cinco pasos sobre un objetivo
 *     ya alcanzado. Ahora el paso es de 2, hay 2,5 s de espera tras cada
 *     cambio, el tope es 0x68 (por encima de 0x7C el ADC recorta con el dedo
 *     puesto) y NO se sube corriente sin dedo, que es lo que disparaba la rampa.
 *
 *  3. LA PRESENCIA DE DEDO ERA ABSOLUTA — `ir > airBase + 4000` deja de valer
 *     en cuanto el AGC cambia la corriente, y rebotaba tres veces en 70 ms.
 *     Ahora R_norm = IR_DC / LED_PA, que es inmune a la ganancia:
 *        con dedo ~2117 · sin dedo ~35 · contraste 60x
 *     Umbrales 600/250 con 250 ms de antirrebote: 3,5x de margen por abajo.
 *
 *  4. EL "RITMO FANTASMA" CON EL DEDO LEJOS no era un latido. Era el ruido del
 *     sensor (~5 cuentas rms sobre un fondo de 1550) pasado por un filtro
 *     pasabanda: cualquier ruido filtrado entre 0,7 y 3 Hz oscila a ~1 Hz, que
 *     son 60 lpm. Con el dedo puesto la componente pulsatil es 30 VECES mayor.
 *     Lo mata la puerta de calidad (dedo + PI minimo + sin saturar).
 *
 *  5. LOS FILTROS DE PRIMER ORDEN dejaban pasar la deriva de baja frecuencia,
 *     que es justo lo que hacia "sonar" el ruido. Ahora Butterworth de 2o orden
 *     0,8-2,5 Hz en cascada de biquads.
 *
 *  6. EL REGISTRO PERDIA MUESTRAS Y EL RELOJ ERA DEL MOVIL — el JavaScript
 *     escribia una fila por MENSAJE de WebSocket (25 Hz) con Date.now() del
 *     telefono. De ahi el jitter de 54 ms, el hueco de 3,96 s y el 2,8 % de
 *     filas repetidas: no era el sensor, era la cadena de registro. Ahora el
 *     ESP32 manda el lote entero de muestras con SU reloj, y el telefono
 *     escribe una fila por muestra real.
 *
 *  7. ADEMAS: la configuracion del sensor se LEE DE SUS REGISTROS al arrancar y
 *     se mete en la cabecera del CSV. Sin eso no se pueden comparar dos
 *     sesiones: entre 118 y 411 us de ancho de pulso la escala cambia x3,5.
 *     (En la sesion analizada el codigo decia 118 us = 16 bits, tope 65535,
 *     pero el 56 % de las muestras pasaban de 65535 con pasos de 1 cuenta.
 *     Algo no cuadraba. Ahora el firmware lo dice a la cara.)
 *
 *  CABLEADO — sin cambios
 *    MAX30102 : VIN->3V3  GND->GND  SCL->D22  SDA->D21   (INT->D19, sin usar)
 *    Pot 10k  : D25 riel alto · D33 CURSOR (ADC1_CH5) · D32 riel bajo
 * ========================================================================== */
#include <Wire.h>
#include "MAX30105.h"
#include <WebServer.h>
#define WEBSOCKETS_TCP_TIMEOUT 200
#include <WebSocketsServer.h>
#include <esp_timer.h>
#include <LittleFS.h>          // caja negra nocturna en el flash del propio ESP32
#include "wifi_setup.h"
#include "pot_cal.h"
#include "vela.h"
#include "pulso.h"

/* ==== ui.h incrustado ==== */
/* ============================================================================
 *  rESPira · ui.h  —  lenguaje visual y grabacion, COMPARTIDOS
 * ============================================================================
 *  Dos ficheros que sirve el ESP32 y que usan las tres paginas:
 *
 *    /ui.css     el sistema visual: colores, tipografia, componentes.
 *                Antes cada pagina traia su propio CSS y los tres eran
 *                distintos (tres fondos, tres verdes, tres tamanos de card).
 *
 *    /grabar.js  la grabacion. Antes vivia solo en la pagina principal, asi
 *                que al irte a /vela la pagina se descargaba y la sesion se
 *                cortaba. Ahora el estado vive en IndexedDB: empiezas a
 *                grabar en el panel, te vas a la vela, vuelves, y sigue.
 *
 *  Sacarlos de las paginas AHORRA memoria de programa: el CSS estaba
 *  triplicado y el codigo de grabacion duplicado.
 *
 *  LA PALETA esta validada, no elegida a ojo. Sobre el fondo #0d1219 los tres
 *  colores de datos pasan todas las comprobaciones de separacion, incluida la
 *  de vision con deficiencia de color, en TODOS los pares:
 *      azul #3987e5 = pulmon   ·   aqua #199e70 = pulso   ·   oro #c98500 = vela
 *  El rojo y el ambar quedan RESERVADOS para estados (fallo, aviso) y siempre
 *  van con texto al lado, nunca solos como si fueran una serie mas.
 * ========================================================================== */

static const char UI_CSS[] PROGMEM = R"CSS(
:root{
  /* superficies */
  --bg:#080c11; --s1:#0f1620; --s2:#0b1118; --s3:#16202b;
  --line:#1e2b39; --line-2:#2a3b4c;
  /* tinta */
  --tx:#e3ecf4; --tx2:#9db0c2; --tx3:#64798d;
  /* datos — validados en todos los pares sobre #0d1219 */
  --pulso:#199e70; --pulmon:#3987e5; --vela:#c98500;
  --pulso-luz:#3fd39c; --pulmon-luz:#6fb2f5; --vela-luz:#f0b93c;
  /* estados — reservados, siempre con texto */
  --mal:#e66767; --ojo:#e0a34a; --bien:#199e70;
  --r:12px; --r2:8px;
}
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%}
body{background:var(--bg);color:var(--tx);
  font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  -webkit-font-smoothing:antialiased;padding:0 0 18px}

/* ---------------- barra superior: la misma en las tres ---------------- */
.top{position:sticky;top:0;z-index:40;background:rgba(8,12,17,.92);
  backdrop-filter:blur(10px);border-bottom:1px solid var(--line);
  padding:9px 12px;display:flex;align-items:center;gap:10px}
.top .marca{font-size:12px;letter-spacing:.18em;font-weight:700;color:var(--pulso-luz);
  white-space:nowrap}
.top .marca em{font-style:normal;color:var(--tx3);font-weight:500;letter-spacing:.08em}
.nav{display:flex;gap:4px;margin-left:auto}
.nav a{display:block;padding:6px 11px;border-radius:20px;text-decoration:none;
  font-size:12.5px;font-weight:600;color:var(--tx2);border:1px solid transparent;
  white-space:nowrap}
.nav a.on{background:var(--s3);color:var(--tx);border-color:var(--line-2)}
.nav a:active{background:var(--s3)}

.wrap{padding:10px 12px;max-width:760px;margin:0 auto}
.g{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.card{background:var(--s1);border:1px solid var(--line);border-radius:var(--r);padding:13px}
.card.w{grid-column:1/-1}
.card.acento{background:linear-gradient(150deg,#1a1405,var(--s1));border-color:#3b2f10}

/* ---------------- tipografia de datos ---------------- */
.k{font-size:10px;letter-spacing:.15em;color:var(--tx3);text-transform:uppercase;
  font-weight:650;margin-bottom:5px}
.v{font-size:32px;font-weight:700;line-height:1.05;font-variant-numeric:tabular-nums;
  letter-spacing:-.02em}
.v.xl{font-size:62px;letter-spacing:-.04em}
.u{font-size:12px;color:var(--tx3);font-weight:500;letter-spacing:0}
.sm{font-size:12px;color:var(--tx2);font-variant-numeric:tabular-nums;line-height:1.45}
.sm b{color:var(--tx);font-weight:650}
.nota{font-size:11.5px;color:var(--tx3);line-height:1.4}
.fila{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.fila.c{align-items:center}

/* colores por rol — el color SIEMPRE acompana a un texto, nunca va solo */
.c-pulso{color:var(--pulso-luz)} .c-pulmon{color:var(--pulmon-luz)} .c-vela{color:var(--vela-luz)}
.c-mal{color:var(--mal)} .c-ojo{color:var(--ojo)} .c-bien{color:var(--pulso-luz)}

/* ---------------- componentes ---------------- */
.bar{height:6px;background:var(--s2);border-radius:3px;overflow:hidden;margin-top:7px}
.bar i{display:block;height:100%;width:0%;background:var(--tx3);
  transition:width .25s ease, background .3s}
.bar.pulso i{background:var(--pulso)} .bar.pulmon i{background:var(--pulmon)}
.bar.ojo i{background:var(--ojo)} .bar.mal i{background:var(--mal)}

.tank{height:130px;background:var(--s2);border-radius:10px;position:relative;
  overflow:hidden;margin-top:7px;border:1px solid var(--line)}
.tank i{position:absolute;bottom:0;left:0;right:0;height:0%;
  background:linear-gradient(180deg,var(--pulmon-luz),var(--pulmon));
  transition:height .12s linear}
.tank .marca-t{position:absolute;left:8px;font-size:10px;color:var(--tx3);letter-spacing:.1em}

.btn{display:inline-flex;align-items:center;gap:7px;background:var(--s3);color:var(--tx);
  border:1px solid var(--line-2);border-radius:var(--r2);padding:9px 13px;
  text-decoration:none;font-size:13px;font-weight:600;margin:5px 5px 0 0;cursor:pointer}
.btn:active{background:var(--line)}
.btn.p{background:var(--pulso);border-color:var(--pulso);color:#04150e}
.btn.v{background:var(--vela);border-color:var(--vela);color:#1a1200}
.btn.rec{background:var(--mal);border-color:var(--mal);color:#210a0a}

.pill{display:inline-block;font-size:10.5px;font-weight:700;padding:2px 8px;
  border-radius:20px;letter-spacing:.04em;white-space:nowrap}
.pill.ok{background:#0f2a1f;color:var(--pulso-luz)}
.pill.ojo{background:#2b2113;color:var(--ojo)}
.pill.mal{background:#2c1616;color:var(--mal)}

canvas{display:block;width:100%;border-radius:var(--r2);background:var(--s2)}
input.txt{background:var(--s2);color:var(--tx);border:1px solid var(--line-2);
  border-radius:var(--r2);padding:8px 10px;font:13px system-ui;width:100%;max-width:230px}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;
  color:var(--tx3);word-break:break-all;line-height:1.5}

/* punto de latido — el mismo aqua del pulso en toda la app */
.late{width:13px;height:13px;border-radius:50%;background:var(--s3);display:inline-block;
  vertical-align:middle;margin-left:9px;transition:background .08s,box-shadow .08s}
.late.on{background:var(--pulso-luz);box-shadow:0 0 16px var(--pulso-luz)}

/* ---------------- insignia de grabacion, en las tres paginas ---------------- */
#recBadge{position:fixed;left:50%;transform:translateX(-50%);bottom:14px;z-index:60;
  display:none;align-items:center;gap:9px;background:rgba(230,103,103,.14);
  border:1px solid var(--mal);border-radius:22px;padding:7px 14px;
  font:12.5px/1 system-ui;color:var(--tx);font-variant-numeric:tabular-nums;
  backdrop-filter:blur(8px);cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,.5)}
#recBadge.on{display:flex}
#recBadge .pt{width:9px;height:9px;border-radius:50%;background:var(--mal);
  animation:lat 1.6s ease-in-out infinite}
#recBadge b{font-weight:700}
#recBadge .parar{color:var(--mal);font-weight:700;margin-left:3px}
@keyframes lat{0%,100%{opacity:1}50%{opacity:.25}}

/* cuando la insignia de grabacion esta puesta, el contenido se aparta:
   si no, tapa justo los botones de la tarjeta de sesion */
body.grabando{padding-bottom:64px}
@media(min-width:620px){ .wrap{padding:14px} .g{gap:11px} }
)CSS";

/* ==========================================================================
 *  /grabar.js — la grabacion, compartida por las tres paginas
 * ========================================================================== */
static const char REC_JS[] PROGMEM = R"JS(
/* rESPira · grabacion que SOBREVIVE a cambiar de pagina.
   El problema: /vela y /pulso son paginas distintas. Al navegar, la que
   estaba grabando se descarga y el estado se pierde. La solucion no es
   duplicar el codigo: es guardar el estado EN IndexedDB, que es de origen,
   no de pagina. Cada pagina, al cargar, pregunta "hay una sesion activa?"
   y si la hay sigue escribiendo en ella.                                   */
window.Rec = (function(){
  const V = 3;
  let db=null, activa=null, cola=[], nfil=0, cfg='', fs=100, listos=[];

  function ready(f){ db ? f() : listos.push(f); }

  const rq = indexedDB.open('respira', V);
  rq.onupgradeneeded = e=>{
    const d=e.target.result;
    if(!d.objectStoreNames.contains('datos'))
      d.createObjectStore('datos',{autoIncrement:true}).createIndex('sid','sid');
    if(!d.objectStoreNames.contains('ses'))  d.createObjectStore('ses',{keyPath:'id'});
    if(!d.objectStoreNames.contains('meta')) d.createObjectStore('meta',{keyPath:'k'});
  };
  rq.onsuccess = e=>{
    db=e.target.result;
    // ¿quedo una sesion abierta en otra pagina?
    db.transaction('meta').objectStore('meta').get('activa').onsuccess = ev=>{
      const m = ev.target.result;
      if(m && m.sid){ activa=m; nfil=m.filas||0; }
      listos.forEach(f=>f()); listos=[];
      pinta();
    };
  };

  fetch('/cfg.txt').then(r=>r.text()).then(t=>{
    cfg=t; const m=t.match(/fs_fifo=(\d+)/); if(m) fs=+m[1];
  }).catch(()=>{});

  function guardaEstado(){
    if(!db) return;
    const st=db.transaction('meta','readwrite').objectStore('meta');
    activa ? st.put(Object.assign({k:'activa',filas:nfil},activa)) : st.put({k:'activa',sid:0});
  }

  /* El total de filas se incrementa DENTRO de la misma transaccion en la que
     se escriben. Antes cada pagina guardaba su propio contador absoluto, y al
     navegar habia una carrera: la pagina que se descargaba volcaba su cola con
     un total viejo justo despues de que la nueva ya hubiera leido el suyo, y
     el contador retrocedia. Leer-sumar-escribir en una sola transaccion lo
     hace atomico.                                                           */
  function volcar(){
    if(!db || !activa || !cola.length) return;
    const f=cola; cola=[];
    const tx=db.transaction(['datos','meta','ses'],'readwrite');
    tx.objectStore('datos').add({sid:activa.sid, f:f});
    const mo=tx.objectStore('meta');
    const sid=activa.sid, t0=activa.t0, etq=activa.etiq, cf=activa.cfg;
    mo.get('activa').onsuccess = e=>{
      const m=e.target.result||{};
      // 'activa' puede haberse puesto a null entre que arranca la transaccion
      // y llega esta respuesta (si pulsas Parar justo ahora): usamos la copia
      if(!m.sid || m.sid!==sid) return;
      const total=(m.filas||0)+f.length;
      nfil=total;
      mo.put(Object.assign({},m,{k:'activa',filas:total}));
      tx.objectStore('ses').put({id:sid, ini:new Date(t0).toISOString(),
        filas:total, etiq:etq, cfg:cf});
    };
  }

  /* Una fila por MUESTRA real del sensor, con el reloj del ESP32.
     d.per es el periodo que ha medido el propio ESP32: su FIFO no va a los
     100 Hz nominales sino a ~106,7 (tolerancia del oscilador del MAX30102),
     y reconstruir con 10,000 ms cuando el paso real es 9,375 mete casi 2 ms
     de error dentro de cada lote. Irrelevante para la frecuencia; no para la
     variabilidad, que es justo lo que se quiere medir.                      */
  function push(d){
    if(!activa || d.pong!==undefined) return;
    const n   = (d.irl && d.irl.length) ? d.irl.length : 1;
    const per = (d.per && d.per>1) ? d.per : (1000/fs);
    for(let k=0;k<n;k++){
      cola.push([ Math.round(d.t-(n-1-k)*per), (d.irl?d.irl[k]:d.ir), d.p,
                  d.bm, d.b, d.i, (k===n-1?d.beat:0), Math.round(d.amp), d.led,
                  d.f, d.g, (d.pi||0).toFixed(3), Math.round(d.rn||0),
                  d.cf, d.sat, d.idx ].join(','));
    }
  }

  function arranca(etiq){
    ready(()=>{
      const id=Date.now();
      activa={sid:id, t0:id, etiq:(etiq||'').trim(), cfg:cfg};
      nfil=0; cola=[];
      db.transaction('ses','readwrite').objectStore('ses')
        .put({id:id, ini:new Date(id).toISOString(), filas:0, etiq:activa.etiq, cfg:cfg});
      guardaEstado(); pinta(); avisa();
    });
  }
  function para(){
    ready(()=>{
      volcar();                       // usa la copia local de la sesion
      const fin=activa; activa=null;
      if(fin){ const st=db.transaction('meta','readwrite').objectStore('meta');
               st.put({k:'activa',sid:0,filas:nfil}); }
      pinta(); avisa();
    });
  }
  function alterna(etiq){ activa ? para() : arranca(etiq); }

  /* Descarga. Dentro de la APK va A CHORROS por el puente RespiraAndroid
     directo a Descargas/: una noche a 100 Hz son ~170 MB y montarlos en un
     solo string tumbaria la pagina. En Chrome (sesiones cortas) sigue el
     camino clasico del blob. */
  function descarga(sid){
    ready(()=>{
      const obj = sid || (activa && activa.sid) || 0;
      db.transaction('ses').objectStore('ses').get(obj).onsuccess = ev=>{
        const meta = ev.target.result || {};
        const nom=(meta.etiq?meta.etiq.replace(/[^A-Za-z0-9_-]/g,'_')+'_':'')+(obj||'todo');
        const fich='respira_'+nom+'.csv';
        const cab='# '+(meta.cfg||cfg)+';etiq='+(meta.etiq||'')+'\n'
          + 't_ms,ir,pot_pct,bpm_mediana,bpm_inst,ibi_ms,latido,amp,led,dedo,'
          + 'gate,pi_pct,r_norm,conf,sat,idx\n';
        const puente = !!(window.RespiraAndroid && RespiraAndroid.abrirCsv);
        if(puente){
          if(!RespiraAndroid.abrirCsv(fich)){ avisa('no pude crear el fichero'); return; }
          RespiraAndroid.trozoCsv(cab);
        }
        const st=db.transaction('datos').objectStore('datos');
        let nf=0; const filas=[];
        st.openCursor().onsuccess = e=>{
          const c=e.target.result;
          if(c){
            if(!obj || c.value.sid===obj){
              nf += c.value.f.length;
              if(puente) RespiraAndroid.trozoCsv(c.value.f.join('\n')+'\n');
              else filas.push(...c.value.f);
            }
            c.continue(); return;
          }
          if(puente){
            RespiraAndroid.cerrarCsv();
            avisa(nf ? (nf.toLocaleString('es-ES')+' filas en Descargas/'+fich)
                     : 'no hay nada grabado');
            return;
          }
          if(!filas.length){ avisa('no hay nada grabado'); return; }
          const csv = cab + filas.join('\n');
          const a=document.createElement('a');
          a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
          a.download=fich; a.click();
          avisa('descargadas '+filas.length+' filas');
        };
      };
    });
  }

  function lista(f){
    ready(()=>{
      const st=db.transaction('ses').objectStore('ses'), out=[];
      st.openCursor().onsuccess=e=>{ const c=e.target.result;
        if(c){ out.push(c.value); c.continue(); }
        else { out.sort((a,b)=>b.id-a.id); f(out); } };
    });
  }
  function borra(f){
    ready(()=>{
      db.transaction('datos','readwrite').objectStore('datos').clear();
      db.transaction('ses','readwrite').objectStore('ses').clear();
      activa=null; nfil=0; cola=[]; guardaEstado(); pinta();
      setTimeout(()=>f&&f(),200);
    });
  }

  // ---- insignia flotante: en cualquier pagina que incluya este fichero ----
  let badge=null;
  function pinta(){
    if(!badge){
      badge=document.createElement('div'); badge.id='recBadge';
      badge.innerHTML='<i class=pt></i><span id=recTxt></span><span class=parar>PARAR</span>';
      badge.onclick=para;
      document.body.appendChild(badge);
    }
    badge.className = activa ? 'on' : '';
    document.body.classList.toggle('grabando', !!activa);
    if(activa){
      const s=((Date.now()-activa.t0)/1000)|0;
      const mm=String((s/60)|0).padStart(2,'0'), ss=String(s%60).padStart(2,'0');
      document.getElementById('recTxt').innerHTML =
        (activa.etiq ? '<b>'+activa.etiq+'</b> · ' : '') + mm+':'+ss +
        ' · ' + (nfil+cola.length).toLocaleString('es-ES') + ' filas';
    }
  }
  const oyentes=[];
  function avisa(msg){ oyentes.forEach(f=>f(!!activa, nfil+cola.length, msg)); }
  function alCambiar(f){ oyentes.push(f); }

  setInterval(()=>{ if(activa){ volcar(); pinta(); avisa(); } }, 1000);
  // si cierras la pestana, lo que quede en la cola se guarda igual
  addEventListener('pagehide', volcar);
  addEventListener('visibilitychange', ()=>{ if(document.hidden) volcar(); });

  return { push, arranca, para, alterna, descarga, lista, borra, alCambiar,
           activa:()=>!!activa, filas:()=>nfil+cola.length,
           etiqueta:()=>activa?activa.etiq:'',
           cfg:()=>cfg, fs:()=>fs };
})();

/* barra superior compartida — asi las tres paginas se ven el mismo instrumento */
window.barra = function(aqui){
  const p=[['/','Panel'],['/vela','Vela'],['/pulso','Pulso'],['/pot','Pulmón']];
  document.body.insertAdjacentHTML('afterbegin',
    '<div class=top><div class=marca>rESPIRA <em>v9.1</em></div><nav class=nav>'
    + p.map(([h,n])=>'<a href="'+h+'"'+(h===aqui?' class=on':'')+'>'+n+'</a>').join('')
    + '</nav></div>');
};
)JS";


/* ==== respira_ppg.h incrustado ==== */
/* ============================================================================
 *  respira_ppg.h  ·  cadena de señal PPG para rESPira v9
 * ============================================================================
 *  Se ENCHUFA a tu v8. No sustituye nada de la arquitectura: ni WiFi, ni
 *  servidor, ni WebSocket, ni grabacion en el movil, ni /vela, ni /pulso.
 *  Sustituye solo tres cosas de v8:
 *      - los filtros de primer orden        -> paso-banda Butterworth de 2o
 *      - pushSample()                       -> ppg::update()
 *      - autoGanancia()                     -> ppg::agc()
 *      - la presencia por "ir > airBase+4000" -> R_norm (inmune a la ganancia)
 *
 *  v9.1 — CORRIGE UN FALLO GRAVE encontrado en las sesiones Whistle y Apoyo:
 *  la envolvente de amplitud no tenia techo. Cada artefacto de movimiento la
 *  disparaba a 25.000 cuentas y tardaba 40 s en bajar; mientras tanto el
 *  umbral quedaba tan abajo que ningun latido real lo cruzaba. En el aguante
 *  final del Whistle eso dejo el detector CIEGO 71 s seguidos, con la puerta
 *  abierta al 100 %. La FC habia subido de 61 a 73 lpm y no se vio.
 *  Arreglos: techo fisiologico en la envolvente, bajada en 4 s en vez de 40,
 *  umbral desde la mediana de amplitudes ACEPTADAS, refractario adaptativo,
 *  deteccion de escalon de DC, y PI fuera de la puerta.
 *
 *  MEDIDO EN TUS SESIONES: la perfusion real es 0,03-0,35 %, no 1-3 %. Lo que
 *  reportaba antes era la envolvente inflada. Por eso PI_MIN=0.15 cerraba la
 *  puerta sobre senal perfectamente buena: a 0,028 % el pulso sigue siendo
 *  legible (autocorrelacion 0,79). La PI ya NO decide nada; solo se muestra.
 *
 *  CALIBRADO con la sesion respira_1785646237992.csv (403 s, 9878 filas):
 *      k_DEDO = 2117 cuentas por LSB de LED_PA   (dedo en contacto)
 *      k_AIRE =   35 cuentas por LSB             (crosstalk optico del chip)
 *      contraste = 60x
 *
 *  Si cambias FS_HZ hay que recalcular los coeficientes del biquad. Los tienes
 *  tabulados abajo para 25, 50 y 100 Hz; el codigo elige solo.
 * ========================================================================== */

namespace ppg {

// ---------------------------------------------------------------- ajustes ---
// Cambia SOLO estas. Todo lo demas se deriva.
static const float    FS_HZ        = 100.0f;  // FIFO del MAX30102 (SAMPLE_RATE/SMP_AVERAGE)
static const uint32_t ADC_FULL     = 262143;  // 18 bits. A 16 bits pon 65535.

// Punto de trabajo del LED. Con k=2117 el optimo es LED_PA ~= 68.
static const uint32_t DC_HI        = 200000;  // 76% del fondo -> baja corriente
static const uint32_t DC_LO        =  70000;  // 27% del fondo -> sube corriente
static const uint8_t  LED_MIN      = 0x18;    //  24 -> 4.8 mA
static const uint8_t  LED_MAX      = 0x68;    // 104 -> 20.8 mA. NO subas de 124:
                                              // con tu dedo el ADC recorta.
static const uint8_t  LED_STEP     = 2;       // v8 usaba 16: demasiado grueso
static const uint32_t AGC_PERIOD_MS= 500;
static const uint32_t AGC_SETTLE_MS= 2500;    // > constante de tiempo del DC

// Presencia de dedo por R = IR_DC / LED_PA.  dedo ~2117, aire ~35.
static const float    R_ON         = 600.0f;
static const float    R_OFF        = 250.0f;
static const uint32_t DEBOUNCE_MS  = 250;

/* Puerta de calidad. Ya NO usa la PI: en tus sesiones el pulso bueno tenia
   PI de 0,03 %, muy por debajo de cualquier umbral razonable, y aun asi era
   perfectamente detectable. Lo que mata el "ritmo fantasma" es la presencia
   de dedo por R_norm (contraste 60x) mas la coherencia de los IBIs.        */
static const float    PI_MIN       = 0.0f;    // % — desactivada a proposito
static const float    BPM_MIN      = 35.0f;
static const float    BPM_MAX      = 190.0f;

// Polaridad. En reflectancia el IR BAJA en sistole, asi que el latido es un
// MINIMO de la señal filtrada. Verificado sobre tus 4 ventanas limpias: los
// minimos ganaron en las 4. Ponlo a false para comparar en una sesion A/B.
static const bool     DETECTAR_MINIMOS = true;

// Detector — ajustados por busqueda en rejilla contra una referencia
// independiente (FFT + autocorrelacion) de las sesiones Whistle y Apoyo.
static const float    THR_FRAC     = 0.30f;   // umbral = medio - 0.30*referencia
static const float    REFR_S       = 0.36f;   // refractario base 360 ms
static const float    REFR_MAX_S   = 0.48f;   // techo del refractario adaptativo
static const float    IBI_TOL      = 0.40f;   // rechaza IBI que se desvie >40%
static const float    LOCKOUT_S    = 2.5f;    // 2,5 s sin latido -> reengancha
static const float    STALE_S      = 5.0f;    // 5 s sin latido valido -> bpm 0
static const uint8_t  NIBI         = 8;

/* EL ARREGLO CLAVE. La envolvente no puede superar este porcentaje del DC.
   Tu pulso real mide 0,03-0,35 % del DC; un artefacto de movimiento mide
   15 %. Con techo, un artefacto ya no puede secuestrar el umbral.          */
static const float    ENV_CAP_PCT  = 0.15f;   // % del DC
static const float    ENV_REL_S    = 4.0f;    // bajada de la envolvente (era 40)
static const float    DC_STEP_PCT  = 3.0f;    // salto de DC = el dedo se movio
static const float    BLANK_S      = 1.5f;    // silencio tras un salto

// ------------------------------------------------------------------ filtro ---
struct Biquad {
  float b0=0,b1=0,b2=0,a1=0,a2=0,z1=0,z2=0;
  inline float step(float x){
    float y = b0*x + z1;
    z1 = b1*x - a1*y + z2;
    z2 = b2*x - a2*y;
    return y;
  }
  void clear(){ z1=z2=0; }
};

/* Butterworth paso-banda 0.8-2.5 Hz de 2o orden = 2 secciones.
   Coeficientes precalculados: un ESP32 no tiene que hacer esto en marcha, y
   asi no dependes de que la formula bilineal este bien escrita.             */
struct BandPass {
  Biquad s1, s2;
  void init(float fs){
    if (fs > 75.0f){                    // 100 Hz
      s1.b0= 2.6498449911e-03f; s1.b1= 5.2996899821e-03f; s1.b2= 2.6498449911e-03f;
      s1.a1=-1.8801842867e+00f; s1.a2= 8.9844867027e-01f;
      s2.b0= 1.0f; s2.b1=-2.0f; s2.b2= 1.0f;
      s2.a1=-1.9538140840e+00f; s2.a2= 9.5698092066e-01f;
    } else if (fs > 37.5f){             // 50 Hz
      s1.b0= 9.8841837691e-03f; s1.b1= 1.9768367538e-02f; s1.b2= 9.8841837691e-03f;
      s1.a1=-1.7380702505e+00f; s1.a2= 8.0744982088e-01f;
      s2.b0= 1.0f; s2.b1=-2.0f; s2.b2= 1.0f;
      s2.a1=-1.9031643937e+00f; s2.a2= 9.1555414801e-01f;
    } else {                            // 25 Hz
      s1.b0= 3.4761596364e-02f; s1.b1= 6.9523192727e-02f; s1.b2= 3.4761596364e-02f;
      s1.a1=-1.4024925973e+00f; s1.a2= 6.5379824939e-01f;
      s2.b0= 1.0f; s2.b1=-2.0f; s2.b2= 1.0f;
      s2.a1=-1.7889540896e+00f; s2.a2= 8.3631471862e-01f;
    }
  }
  inline float step(float x){ return s2.step(s1.step(x)); }
  void clear(){ s1.clear(); s2.clear(); }
};

// --------------------------------------------------------------- resultado ---
struct Out {
  bool     beat   = false;   // latido en ESTA muestra
  float    bpm    = 0;       // mediana de los ultimos IBIs validos
  uint16_t ibiMs  = 0;
  uint8_t  conf   = 0;       // 0..100, dispersion de los IBIs
  float    dc     = 0;       // continua del IR
  float    ac     = 0;       // señal filtrada 0.8-2.5 Hz
  float    amp    = 0;       // amplitud pico-a-pico de la envolvente
  float    pi     = 0;       // indice de perfusion, %
  float    rnorm  = 0;       // IR_DC / LED_PA
  bool     finger = false;
  bool     gate   = false;   // dedo + calidad + sin saturar
  bool     sat    = false;
};

// ------------------------------------------------------------------ motor ---
class Motor {
public:
  void begin(float fs = FS_HZ){
    fs_ = fs;
    bp_.init(fs_);
    refrMin_ = (uint32_t)(REFR_S*fs_);
    refrMax_ = (uint32_t)(REFR_MAX_S*fs_);
    lock_    = (uint32_t)(LOCKOUT_S*fs_);
    stale_   = (uint32_t)(STALE_S*fs_);
    debN_    = (uint32_t)(DEBOUNCE_MS*fs_/1000.0f);
    blankN_  = (uint32_t)(BLANK_S*fs_);
    stepN_   = (uint32_t)(0.25f*fs_);
    aDC_     = 1.0f/fs_;                 // constante de tiempo del DC: 1 s
    rel_     = 1.0f/(ENV_REL_S*fs_);     // bajada de la envolvente
    hardReset();
  }

  void hardReset(){
    bp_.clear(); dcInit_=false; dcV_=0; dcAnt_=0; nDC_=0; blank_=0;
    softReset(); finger_=false; deb_=0;
  }
  /* Reinicio del DETECTOR. La envolvente se deja decaer, no se pone a cero:
     ponerla a cero era el bloqueo mutuo que dejaba `amp` en 0 el 85 % del
     tiempo en v8. Lo que si se tira es la referencia de amplitud aceptada. */
  void softReset(){
    since_=0xFFFFFFFF; sinceOk_=0xFFFFFFFF; nIbi_=0; iIbi_=0; nAmp_=0; iAmp_=0;
    last_=0; n_=0; y1_=y2_=0; bpm_=0; ibiMs_=0; conf_=0;
  }

  Out update(uint32_t ir, uint8_t ledPA){
    Out o;
    o.sat = (ir >= ADC_FULL - 8);

    // ---- continua ----
    if(!dcInit_){ dcV_ = (float)ir; dcAnt_ = dcV_; dcInit_ = true; }
    else dcV_ += aDC_*((float)ir - dcV_);
    o.dc = dcV_;

    /* ---- escalon de DC = el dedo se ha movido ----
       El escalon atraviesa el filtro y parece un latido gigante. Antes de
       este detector, un solo escalon secuestraba la envolvente 40 s.       */
    if (++nDC_ >= stepN_){
      float salto = fabsf(dcV_ - dcAnt_) / (dcV_ > 1.0f ? dcV_ : 1.0f) * 100.0f;
      if (salto > DC_STEP_PCT && blank_ == 0){
        blank_ = blankN_;
        bp_.clear(); hi_ = -1e9f; lo_ = 1e9f; amp_ = 1.0f;
        softReset();
      }
      dcAnt_ = dcV_; nDC_ = 0;
    }
    if (blank_ > 0) blank_--;

    // ---- pulsatil ----
    float y = bp_.step((float)ir);
    if (!DETECTAR_MINIMOS) y = -y;
    o.ac = DETECTAR_MINIMOS ? y : -y;

    /* ---- envolvente: sube al instante, baja en ENV_REL_S, CON TECHO ----
       El techo es el arreglo principal de v9.1. Sin el, un artefacto de
       15 % de modulacion deja el umbral por debajo de cualquier latido
       real (que mide 0,03-0,35 %) durante mas de un minuto.                */
    if (y > hi_) hi_ = y; else hi_ -= (hi_ - lo_)*rel_;
    if (y < lo_) lo_ = y; else lo_ += (hi_ - lo_)*rel_;
    amp_ = hi_ - lo_; if (amp_ < 1.0f) amp_ = 1.0f;
    float cap = ENV_CAP_PCT/100.0f * dcV_;
    if (cap < 4.0f) cap = 4.0f;
    if (amp_ > cap){
      float c = 0.5f*(hi_ + lo_);
      hi_ = c + cap*0.5f; lo_ = c - cap*0.5f; amp_ = cap;
    }
    o.amp = amp_;

    // ---- presencia de dedo por corriente normalizada ----
    o.rnorm = (ledPA > 0) ? (dcV_/(float)ledPA) : 0.0f;
    bool want = finger_ ? (o.rnorm > R_OFF) : (o.rnorm > R_ON);
    if (want != finger_){
      if (++deb_ >= debN_){ finger_ = want; deb_ = 0; if(!finger_) softReset(); }
    } else deb_ = 0;
    o.finger = finger_;

    /* PI honesta: de la mediana de las amplitudes de latidos ACEPTADOS, no de
       la envolvente. Ya no decide nada, pero es el numero que te dice si el
       acoplamiento del dedo es bueno, asi que tiene que ser el de verdad.   */
    float ampRef = (nAmp_ >= 3) ? medAmp() : amp_;
    o.pi = (dcV_ > 1.0f) ? (ampRef/dcV_*100.0f) : 0.0f;

    o.gate = finger_ && !o.sat && (blank_ == 0) && (o.pi >= PI_MIN);

    // ---- deteccion ----
    n_++;
    if (since_   < 0xFFFFFFFF) since_++;
    if (sinceOk_ < 0xFFFFFFFF) sinceOk_++;

    /* Refractario ADAPTATIVO: la muesca dicrota cae al 30-40 % del ciclo, asi
       que bloquear el 55 % del intervalo tipico la descarta sin perder
       latidos. El TECHO es imprescindible: sin el, si la mediana se queda
       alta el refractario bloquea uno de cada dos latidos y se confirma a si
       misma, y el detector se clava a la mitad de tu pulso real.           */
    uint32_t refr = refrMin_;
    if (nIbi_ >= 3){
      uint32_t r = (uint32_t)(medIbi()*0.55f*fs_);
      refr = (r < refrMin_) ? refrMin_ : ((r > refrMax_) ? refrMax_ : r);
    }

    float mid = 0.5f*(hi_ + lo_);
    float ref = (nAmp_ >= 3) ? medAmp() : amp_;
    if (ref > cap) ref = cap;
    float thr = mid - THR_FRAC*ref;

    if (o.gate && n_ >= 3 && since_ > refr && y1_ < thr && y1_ <= y2_ && y1_ <= y){
      float den = (y2_ - 2*y1_ + y);
      float d = (fabsf(den) > 1e-9f) ? 0.5f*(y2_ - y)/den : 0.0f;
      if (d >  1.0f) d =  1.0f;
      if (d < -1.0f) d = -1.0f;
      float tB = (float)(n_ - 1) + d;
      float pico = fabsf(y1_ - mid);

      bool relock = (since_ > lock_);
      if (relock){ nIbi_ = 0; iIbi_ = 0; nAmp_ = 0; iAmp_ = 0; }

      if (last_ > 0.0f && !relock){
        float ibiS = (tB - last_)/fs_;
        float b = (ibiS > 1e-6f) ? 60.0f/ibiS : 0.0f;
        bool ok = (b >= BPM_MIN && b <= BPM_MAX);
        if (ok && nIbi_ >= 3){
          float m = medIbi();
          if (fabsf(ibiS - m)/m > IBI_TOL) ok = false;
        }
        if (ok){
          pushIbi(ibiS); pushAmp(pico);
          o.beat = true; last_ = tB; since_ = 0; sinceOk_ = 0;
        }
        // si se rechaza NO movemos last_: no se pierde el enganche
      } else {
        pushAmp(pico);
        o.beat = true; last_ = tB; since_ = 0;
      }
    }
    y2_ = y1_; y1_ = y;

    // BPM caducado: sin latido valido en STALE_S, no se publica un numero viejo
    if (sinceOk_ > stale_){ bpm_ = 0; ibiMs_ = 0; conf_ = 0; }

    o.bpm   = o.gate ? bpm_   : 0.0f;
    o.ibiMs = o.gate ? ibiMs_ : 0;
    o.conf  = o.gate ? conf_  : 0;
    return o;
  }

  /* AGC. Devuelve la corriente nueva; si es distinta de la que le pasas,
     escribela en el sensor Y llama a notificarCambioGanancia().
     Diferencias con autoGanancia() de v8:
       - paso de 2 en vez de 16
       - espera 2,5 s tras cada cambio (v8: 0,4 s, y su dcLento tarda 2 s)
       - tope en 104 en vez de 240
       - NO sube corriente sin dedo (v8 subia, y por eso la rampa a 252)     */
  uint8_t agc(uint8_t cur, uint32_t nowMs, bool saturado){
    if (nowMs < settleUntil_) return cur;
    if (nowMs - lastAgc_ < AGC_PERIOD_MS) return cur;
    uint8_t nuevo = cur;
    if      (saturado || dcV_ > DC_HI){ if (cur > LED_MIN) nuevo = cur - LED_STEP; }
    else if (finger_  && dcV_ < DC_LO){ if (cur < LED_MAX) nuevo = cur + LED_STEP; }
    if (nuevo < LED_MIN) nuevo = LED_MIN;
    if (nuevo > LED_MAX) nuevo = LED_MAX;
    if (nuevo != cur) lastAgc_ = nowMs;
    return nuevo;
  }
  /* Llamala justo despues de escribir una corriente nueva en el sensor.
     El escalon de continua atraviesa el filtro y parece un latido gigante. */
  void notificarCambioGanancia(uint32_t nowMs){
    settleUntil_ = nowMs + AGC_SETTLE_MS;
    bp_.clear(); hi_ = -1e9f; lo_ = 1e9f; amp_ = 1.0f;
    blank_ = blankN_; softReset();
  }
  bool asentando(uint32_t nowMs) const { return nowMs < settleUntil_; }

  float bpm() const { return bpm_; }
  float amplitud() const { return amp_; }
  bool  blanqueando() const { return blank_ > 0; }

private:
  static float med(const float* v, uint8_t n){
    float t[NIBI]; for(uint8_t i=0;i<n;i++) t[i]=v[i];
    for(uint8_t i=1;i<n;i++){ float x=t[i]; int8_t j=i-1;
      while(j>=0 && t[j]>x){ t[j+1]=t[j]; j--; } t[j+1]=x; }
    return t[n/2];
  }
  float medIbi(){ return med(ibi_, nIbi_); }
  /* La MEDIANA de las amplitudes aceptadas, no una media ni la envolvente:
     un solo artefacto no puede moverla. Es la idea buena de tu v8; lo que le
     faltaba era no poder quedarse vacia para siempre, y de eso se encarga la
     envolvente con techo, que siempre da un valor de reserva.              */
  float medAmp(){ return med(amp_buf_, nAmp_); }

  void pushIbi(float s){
    ibi_[iIbi_] = s; iIbi_ = (iIbi_+1)%NIBI;
    if (nIbi_ < NIBI) nIbi_++;
    if (nIbi_ < 3) return;
    float m = medIbi();
    float mad = 0; for(uint8_t i=0;i<nIbi_;i++) mad += fabsf(ibi_[i]-m);
    mad /= nIbi_;
    conf_  = (uint8_t)constrain((int)(100.0f*(1.0f - (mad/m)*4.0f)), 0, 100);
    ibiMs_ = (uint16_t)(m*1000.0f);
    bpm_   = 60.0f/m;
  }
  void pushAmp(float a){
    amp_buf_[iAmp_] = a; iAmp_ = (iAmp_+1)%NIBI;
    if (nAmp_ < NIBI) nAmp_++;
  }

  BandPass bp_;
  float fs_=FS_HZ, aDC_=0.01f, rel_=0.0025f;
  float dcV_=0, dcAnt_=0; bool dcInit_=false;
  float hi_=-1e9f, lo_=1e9f, amp_=1.0f, y1_=0, y2_=0;
  float ibi_[NIBI]; float amp_buf_[NIBI]; float last_=0, bpm_=0;
  uint32_t refrMin_=38, refrMax_=51, lock_=266, stale_=533, debN_=27;
  uint32_t blankN_=160, stepN_=27, blank_=0, nDC_=0;
  uint32_t since_=0xFFFFFFFF, sinceOk_=0xFFFFFFFF, n_=0;
  uint32_t lastAgc_=0, settleUntil_=0, deb_=0;
  uint8_t  nIbi_=0, iIbi_=0, nAmp_=0, iAmp_=0, conf_=0; uint16_t ibiMs_=0;
  bool finger_=false;
};

/* Cadena de texto con la configuracion de la sesion. Va en la cabecera del CSV
   para que dos sesiones con montajes distintos sean comparables. SIN ESTO no
   se puede calibrar en serie: los conteos de IR dependen del ancho de pulso
   y del rango del ADC, y un cambio de 118 a 411 us mueve la escala x3.5.   */
inline String configStr(int sampleRate, int smpAvg, int pulseWidth,
                        int adcRange, int ledMode, uint8_t ledIni){
  String s;
  s += "fs_fifo="; s += (sampleRate/smpAvg);
  s += ";sr=";     s += sampleRate;
  s += ";avg=";    s += smpAvg;
  s += ";pw=";     s += pulseWidth;
  s += ";bits=";   s += (pulseWidth>=411?18:(pulseWidth>=215?17:(pulseWidth>=118?16:15)));
  s += ";adcrange=";s+= adcRange;
  s += ";ledmode=";s += ledMode;
  s += ";led0=";   s += ledIni;
  s += ";thr=";    s += String(THR_FRAC,2);
  s += ";refr=";   s += String(REFR_S,2);
  s += ";pimin=";  s += String(PI_MIN,2);
  s += ";ron=";    s += (int)R_ON;
  s += ";roff=";   s += (int)R_OFF;
  s += ";minimos=";s += (DETECTAR_MINIMOS?1:0);
  return s;
}

} // namespace ppg


uint16_t leerPotCrudo();     // definida mas abajo; se le pasa a pot::rutas

#define POT_HI 25
#define POT_W  33
#define POT_LO 32

// --------------------------------------------------------- configuracion ---
/* SAMPLE_RATE 200 / SMP_AVERAGE 2  ->  100 Hz en el FIFO (antes 100/4 = 25 Hz).
   Se eligen 200 Hz y no 400 a proposito: con dos LEDs y 411 us de ancho de
   pulso, 200 Hz deja margen de sobra en el presupuesto de tiempo del chip
   (5000 us de periodo frente a 2 x 411 us de conversion). A 400 Hz habria que
   consultar la tabla de combinaciones validas del fabricante.

   PULSE_WIDTH 411 -> ADC de 18 bits, sin ambiguedad. Era 118 (16 bits).      */
byte ledPower          = 0x44;        // 68 -> el optimo con k=2117 cuentas/LSB
const byte SMP_AVERAGE = 2;
const byte LED_MODE    = 2;           // Rojo + IR (solo usamos el IR)
const int  SAMPLE_RATE = 200;
const int  PULSE_WIDTH = 411;
const int  ADC_RANGE   = 4096;
const int  REG_OVF     = 0x05;
const int  REG_FIFOCFG = 0x08;
const int  REG_SPO2CFG = 0x0A;
const uint8_t I2C_ADDR = 0x57;

const int FS_FIFO = SAMPLE_RATE / SMP_AVERAGE;      // 100 Hz

const int BEAT_RING = 200;
const int LOG_LAT   = 240;
const int LOG_ONDA  = 2000;           // ~20 s de onda a 100 Hz (antes 750 a 25)

MAX30105 sensor;
WebServer http(80);
WebSocketsServer ws(81);
ppg::Motor motor;
static inline int64_t nowUs() { return esp_timer_get_time(); }

String cfgSesion = "";                // se rellena en setup(), va en el CSV

// ------------------------------------------------------------- estado PPG ---
long     lastIR   = 0;
bool     sensorOK = false;
bool     dedo     = false;
bool     gateAct  = false;
bool     satUlt   = false;
float    dcAct = 0, acAct = 0, piAct = 0, rnAct = 0, ampAct = 0;
int      bpmAct = 0, ibiAct = 0;
uint8_t  confAct = 0;
uint32_t rechazados = 0;

int64_t beatRing[BEAT_RING];
int     beatHead = 0, beatCount = 0;

// ------------------------------------------------------------ tiempo y fs ---
int64_t  tSampleUs = 0;
float    periodUs  = 1e6f / FS_FIFO;
int64_t  winStartUs = 0; uint32_t winMuestras = 0;
uint32_t muestrasTotal = 0, perdidasTotal = 0, reinicios = 0;
uint8_t  lastOvf = 0;
int64_t  dedoDesdeUs = 0;

bool  beatPend = false;
float ibiPend = 0, bpmPend = 0;

// lotes que viajan en cada mensaje de WebSocket
int     acLote[24];  int nLote   = 0;    // onda filtrada (la usan / y /pulso)
int32_t irLote[24];  int nIrLote = 0;    // IR crudo, para grabar 1 fila/muestra

int     potPct = 0;
int64_t lastSendUs = 0, lastPotUs = 0;

// ------------------------------------------------------------- registros ---
struct RegLat { uint32_t ms; int16_t ibi; int16_t amp; int32_t ir; uint8_t led; uint8_t ok; };
RegLat logLat[LOG_LAT]; int logLatHead = 0; uint32_t logLatN = 0;

struct RegOnda { int32_t ir; int16_t f; uint8_t led; };
RegOnda logOnda[LOG_ONDA]; int logOndaHead = 0; uint32_t logOndaN = 0;

void anotarLatido(int ibiMs, int amp, long ir, bool ok) {
  logLat[logLatHead] = { (uint32_t)(nowUs() / 1000), (int16_t)ibiMs, (int16_t)amp,
                         (int32_t)ir, ledPower, (uint8_t)(ok ? 1 : 0) };
  logLatHead = (logLatHead + 1) % LOG_LAT;
  logLatN++;
}

int bpmMediana() { return bpmAct; }

int bpmConteo60(int64_t ahora, bool &valido) {
  int n = 0;
  for (int i = 0; i < beatCount; i++) {
    int64_t t = beatRing[(beatHead - 1 - i + BEAT_RING) % BEAT_RING];
    if (ahora - t <= 60000000LL) n++; else break;
  }
  valido = dedo && dedoDesdeUs > 0 && (ahora - dedoDesdeUs) >= 60000000LL;
  return n;
}

/* ============================================================================
 *  CAJA NEGRA NOCTURNA — el ESP32 graba solo, sin telefono
 * ============================================================================
 *  Para dormir: telefono apagado, ESP32 a la bateria. El propio sensor guarda
 *  en su flash lo que el analisis necesita de una noche:
 *    'L' cada latido aceptado: t_ms, IBI, amplitud   (la HRV entera)
 *    'R' 2 veces por segundo:  t_ms, pot, DC, PI, puertas  (la respiracion)
 *  La onda cruda NO se guarda: una noche a 100 Hz son ~170 MB y no caben en
 *  ningun flash; ademas el analisis nocturno no la necesita.
 *
 *  Dos ficheros en anillo: al llenarse uno se vacia el otro. Siempre quedan
 *  las ultimas ~10 h. Se vuelca a flash cada 20 s o al llenarse el bufer:
 *  si la bateria muere de madrugada se pierden 20 s como mucho.
 *  Siempre esta grabando: no hay boton que olvidar. Cada arranque deja una
 *  marca 'boot' (el reloj t_ms vuelve a cero al encender).
 * ========================================================================== */
namespace noche {

const uint32_t FLUSH_MS = 20000;

bool     ok = false;
int      activo = 0;                 // 0 -> /n0.bin, 1 -> /n1.bin
size_t   capFichero = 400 * 1024;    // se ajusta al flash real en begin()
uint8_t  buf[1024];
size_t   nBuf = 0;
uint32_t ultimoFlushMs = 0, ultimaMuestraMs = 0;

const char* ruta(int i) { return i ? "/n1.bin" : "/n0.bin"; }

void begin() {
  ok = LittleFS.begin(true);         // true: formatea la primera vez (tarda unos s)
  if (!ok) { Serial.println("# noche: sin particion de datos; caja negra OFF"); return; }
  size_t total = LittleFS.totalBytes();
  capFichero = total / 2 - 8192;
  if (capFichero < 16 * 1024) { ok = false;
    Serial.println("# noche: particion de datos demasiado pequena; caja negra OFF");
    return; }
  File a = LittleFS.open(ruta(0), "r"); size_t s0 = a ? a.size() : 0; if (a) a.close();
  File b = LittleFS.open(ruta(1), "r"); size_t s1 = b ? b.size() : 0; if (b) b.close();
  activo = (s1 > s0) ? 1 : 0;        // sigue donde iba
  buf[nBuf++] = 'B';                 // marca de arranque
  Serial.printf("# noche: caja negra ON, %u KB por anillo (%u+%u KB guardados)\n",
                (unsigned)(capFichero / 1024), (unsigned)(s0 / 1024), (unsigned)(s1 / 1024));
}

void volcar() {
  if (!ok || nBuf == 0) return;
  File f = LittleFS.open(ruta(activo), "a");
  if (!f) f = LittleFS.open(ruta(activo), "w");
  if (!f) return;
  if (f.size() > capFichero) {       // anillo: cambia de fichero y vacia el otro
    f.close();
    activo = 1 - activo;
    f = LittleFS.open(ruta(activo), "w");
    if (!f) return;
  }
  f.write(buf, nBuf);
  f.close();
  nBuf = 0;
}

void mete(const uint8_t* d, size_t n) {
  if (!ok) return;
  if (nBuf + n > sizeof(buf)) volcar();
  if (nBuf + n <= sizeof(buf)) { memcpy(buf + nBuf, d, n); nBuf += n; }
}

void latido(uint32_t tMs, uint16_t ibi, uint16_t amp) {
  uint8_t r[9]; r[0] = 'L';
  memcpy(r + 1, &tMs, 4); memcpy(r + 5, &ibi, 2); memcpy(r + 7, &amp, 2);
  mete(r, 9);
}

void tick(int64_t ahoraUs, int pot, float dc, float pi, bool dedo, bool gate, bool sat) {
  if (!ok) return;
  uint32_t ms = (uint32_t)(ahoraUs / 1000);
  if (ms - ultimaMuestraMs >= 500) {
    ultimaMuestraMs = ms;
    uint16_t dc16  = (uint16_t)(dc / 16.0f);
    uint8_t  pi100 = (uint8_t)constrain((int)(pi * 100.0f), 0, 255);
    uint8_t  flags = (dedo ? 1 : 0) | (gate ? 2 : 0) | (sat ? 4 : 0);
    uint8_t  p8    = (uint8_t)constrain(pot, 0, 100);
    uint8_t r[10]; r[0] = 'R';
    memcpy(r + 1, &ms, 4); r[5] = p8; memcpy(r + 6, &dc16, 2); r[8] = pi100; r[9] = flags;
    mete(r, 10);
  }
  if (ms - ultimoFlushMs >= FLUSH_MS) { ultimoFlushMs = ms; volcar(); }
}

// ---- exportar como CSV, a chorros (chunked) para no montar nada en RAM ----
void volcarFicheroCsv(const char* p) {
  File f = LittleFS.open(p, "r");
  if (!f) return;
  uint8_t r[10];
  String s; s.reserve(3200);
  while (f.available()) {
    int t = f.read();
    if (t == 'B') {
      s += F("boot,0,,,,,,\n");
    } else if (t == 'L') {
      if (f.read(r, 8) != 8) break;
      uint32_t ms; uint16_t ibi, am;
      memcpy(&ms, r, 4); memcpy(&ibi, r + 4, 2); memcpy(&am, r + 6, 2);
      s += F("latido,"); s += (unsigned)ms; s += ','; s += (unsigned)ibi;
      s += ','; s += (unsigned)am; s += F(",,,,\n");
    } else if (t == 'R') {
      if (f.read(r, 9) != 9) break;
      uint32_t ms; uint16_t dc16;
      memcpy(&ms, r, 4); memcpy(&dc16, r + 5, 2);
      s += F("resp,"); s += (unsigned)ms; s += F(",,,");
      s += (int)r[4]; s += ',';
      s += (unsigned)dc16 * 16u; s += ',';
      s += String(r[7] / 100.0f, 2); s += ',';
      s += (int)r[8]; s += '\n';
    } else break;                    // byte desconocido: fichero corrupto, corta
    if (s.length() > 2800) { http.sendContent(s); s = ""; }
  }
  if (s.length()) http.sendContent(s);
  f.close();
}

void servirCsv() {
  if (!ok) { http.send(200, "text/plain", "sin particion de datos en este ESP32"); return; }
  volcar();                          // lo pendiente del bufer, a flash primero
  http.setContentLength(CONTENT_LENGTH_UNKNOWN);
  http.send(200, "text/csv", "");
  String cab = "# " + cfgSesion + "\n";
  cab += F("tipo,t_ms,ibi_ms,amp,pot_pct,ir_dc,pi_pct,flags\n");
  http.sendContent(cab);
  volcarFicheroCsv(ruta(1 - activo));    // el fichero viejo primero, en orden
  volcarFicheroCsv(ruta(activo));
  http.sendContent("");                  // cierre del chunked
}

void borrar() {
  if (ok) { LittleFS.remove(ruta(0)); LittleFS.remove(ruta(1)); nBuf = 0; }
  http.send(200, "text/html",
    "<meta charset=utf-8><body style='background:#0a0f14;color:#e8a33d;"
    "font:17px system-ui;padding:30px'>Caja negra borrada.<br><br>"
    "<a style='color:#7fb8dd' href='/'>Volver</a></body>");
}

}  // namespace noche

// ============================================================================
//  QUE HAY REALMENTE EN LOS REGISTROS DEL SENSOR
//  No lo que dice el codigo: lo que quedo escrito en el chip. Es la unica
//  forma de zanjar la duda de los 16 frente a 18 bits, y es lo que hace que
//  dos sesiones se puedan comparar de verdad.
// ============================================================================
uint8_t leerReg(uint8_t reg) {
  Wire.beginTransmission(I2C_ADDR);
  Wire.write(reg);
  if (Wire.endTransmission(true) != 0) return 0xFF;
  if (Wire.requestFrom(I2C_ADDR, (uint8_t)1) != 1) return 0xFF;
  return Wire.read();
}

String leerConfigDelChip() {
  uint8_t spo2 = leerReg(REG_SPO2CFG);
  uint8_t fifo = leerReg(REG_FIFOCFG);
  if (spo2 == 0xFF) return String("chip=nolee");

  const int    pwUs[]   = { 69, 118, 215, 411 };
  const int    pwBits[] = { 15, 16, 17, 18 };
  const int    srHz[]   = { 50, 100, 200, 400, 800, 1000, 1600, 3200 };
  const int    rgNa[]   = { 2048, 4096, 8192, 16384 };
  const int    avg[]    = { 1, 2, 4, 8, 16, 32, 32, 32 };

  int iPw = spo2 & 0x03;
  int iSr = (spo2 >> 2) & 0x07;
  int iRg = (spo2 >> 5) & 0x03;
  int iAv = (fifo >> 5) & 0x07;

  long fondo = (1L << pwBits[iPw]) - 1;

  String s;
  s += "pw_us=";    s += pwUs[iPw];
  s += ";bits=";    s += pwBits[iPw];
  s += ";fondo=";   s += fondo;
  s += ";sr_hz=";   s += srHz[iSr];
  s += ";avg=";     s += avg[iAv];
  s += ";fs_fifo="; s += (srHz[iSr] / avg[iAv]);
  s += ";adc_na=";  s += rgNa[iRg];
  s += ";led0=";    s += ledPower;
  s += ";ledmode="; s += LED_MODE;
  // parametros del detector: no viven en registros del chip
  s += ";thr=";     s += String(ppg::THR_FRAC,2);
  s += ";refr=";    s += String(ppg::REFR_S,2);
  s += ";pimin=";   s += String(ppg::PI_MIN,2);
  s += ";ron=";     s += (int)ppg::R_ON;
  s += ";roff=";    s += (int)ppg::R_OFF;
  s += ";minimos="; s += (ppg::DETECTAR_MINIMOS?1:0);
  s += ";fw=v9.1";
  return s;
}

// ============================================================================
//  PAGINA
// ============================================================================
static const char PAGE[] PROGMEM = R"HTML(<!doctype html><html lang=es><head>
<meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>rESPira · panel</title><link rel=stylesheet href="/ui.css">
</head><body>
<div class=wrap>
<div class=g>

<div class="card w acento">
  <div class=k style="color:var(--vela-luz)">Biofeedback</div>
  <div class=sm style=margin-bottom:9px>Sin números. Exhala fuerte y casi la apagas.</div>
  <a class="btn v" href="/vela">Encender la vela</a>
  <a class=btn href="/pulso">El pulso como espectro</a>
</div>

<div class="card w">
  <div class=k>Pulso · mediana</div>
  <div class="fila c">
    <div><span class="v xl c-pulso" id=bpm>--</span> <span class=u>lpm</span><i class=late id=late></i></div>
    <div class=sm id=st>conectando…</div>
  </div>
  <div class=sm style=margin-top:7px>
    instantáneo <b id=bpmi>--</b> · <span id=c60lab>contados 60 s</span> <b id=bpm60>--</b>
    · IBI <b id=ibi>--</b> ms · confianza <b id=cf>--</b>
  </div>
</div>

<div class="card w"><div class=k>Onda PPG</div><canvas id=cv height=100></canvas></div>

<div class=card>
  <div class=k>Pulmón</div>
  <div class="v c-pulmon" id=pot>--<span class=u>%</span></div>
  <div class=tank><i id=tank></i>
    <span class=marca-t style=top:6px>lleno</span>
    <span class=marca-t style=bottom:6px>vacío</span></div>
  <a class=btn href="/pot" style=margin-top:9px>Calibrar</a>
</div>

<div class=card>
  <div class=k>Calidad de la señal</div>
  <div class=fila><div class=v id=pi>--<span class=u>% PI</span></div>
    <span class=pill id=estado>—</span></div>
  <div class="bar pulso"><i id=pib></i></div>
  <div class=sm style=margin-top:9px>
    DC <b id=dc>--</b> <span class=nota>del fondo</span></div>
  <div class="bar ojo"><i id=irb></i></div>
  <div class=sm style=margin-top:9px>R_norm <b id=rn>--</b> · LED <b id=led>--</b></div>
  <div class=nota style=margin-top:7px>
    PI real, latido a latido. 0,03–0,35 % es lo normal en este montaje;
    sirve para comparar posturas del dedo, no como umbral.</div>
</div>

<div class="card w">
  <div class=k>Sesión · se guarda en el teléfono</div>
  <div class=sm id=sesest>lista para grabar</div>
  <div class=fila style="margin-top:8px;gap:8px;align-items:center">
    <input class=txt id=etiq placeholder="etiqueta, p. ej. S1-apoyo-firme">
    <a class="btn rec" id=bgrab onclick="grabar();return false" href=#>● Grabar</a>
  </div>
  <div style=margin-top:4px>
    <a class=btn href=# onclick="Rec.descarga();return false">Descargar sesión</a>
    <a class=btn href=# onclick="borrarTodo();return false">Borrar todo</a>
  </div>
  <div class=sm id=seslista style=margin-top:9px>—</div>
  <div class=nota style=margin-top:8px>
    Una fila por muestra real con el reloj del ESP32, y la configuración del
    sensor dentro del CSV. <b>La grabación sigue si te vas a la vela o al pulso.</b>
  </div>
</div>

<div class="card w"><div class=k>Latencia</div>
  <div class=fila>
    <div><div class=nota>ida y vuelta</div><div class=v id=rtt>--<span class=u>ms</span></div></div>
    <div><div class=nota>edad muestra</div><div class=v id=age>--<span class=u>ms</span></div></div>
    <div><div class=nota>muestras/s</div><div class=v id=fps>--</div></div>
  </div>
  <div class=sm style=margin-top:9px id=lat2>p95 -- ms · pérdidas --</div>
</div>

<div class="card w"><div class=k>Noche · caja negra</div>
  <div class=nota>El ESP32 guarda solo, en su propia memoria, cada latido y la
  respiración (2/s): para dormir basta enchufarlo a la batería, <b>sin
  teléfono</b>. Aguanta ~10 h y lo viejo se recicla. Se salva a flash cada
  20 s. Por la mañana, descarga desde aquí.</div>
  <a class=btn href="/noche.csv" download>Descargar la noche (CSV)</a>
  <a class=btn href="/noche/borrar"
     onclick="return confirm('¿Borrar la caja negra del ESP32?')">Borrar</a>
</div>

<div class="card w"><div class=k>Instantáneas del ESP32</div>
  <div class=nota>Sólo lo que hay ahora en su RAM. Para depurar un número raro.</div>
  <a class=btn href="/latidos.csv" download>Últimos latidos</a>
  <a class=btn href="/onda.csv" download>Onda (20 s)</a>
</div>

<div class="card w"><div class=k>Configuración leída del chip</div>
  <div class=mono id=cfgtxt>—</div></div>

<div class="card w"><div class=k>Red</div>
  <div class=sm id=redinfo>—</div>
  <a class=btn href="/wifi">Cambiar de red</a></div>

</div></div>
<script src="/grabar.js"></script>
<script>
const $=i=>document.getElementById(i);
barra('/');

/* ---- onda ---- */
const cv=$('cv'),cx=cv.getContext('2d');let W=0,H=0;
function fit(){const d=Math.min(devicePixelRatio||1,2);
  W=cv.width=cv.clientWidth*d;H=cv.height=100*d}
addEventListener('resize',fit);fit();
const buf=new Array(600).fill(0);let dirty=false;
function draw(){if(!dirty)return;dirty=false;
  const g=cx.createLinearGradient(0,0,0,H);
  cx.clearRect(0,0,W,H);
  let mn=1e9,mx=-1e9;for(const v of buf){if(v<mn)mn=v;if(v>mx)mx=v}
  if(mx-mn<30){const c=(mx+mn)/2;mn=c-15;mx=c+15}
  const Y=v=>H-((v-mn)/(mx-mn))*(H-10)-5;
  // area suave debajo de la traza
  cx.beginPath();cx.moveTo(0,H);
  for(let i=0;i<buf.length;i++)cx.lineTo(i/(buf.length-1)*W,Y(buf[i]));
  cx.lineTo(W,H);cx.closePath();
  g.addColorStop(0,'rgba(25,158,112,.22)');g.addColorStop(1,'rgba(25,158,112,0)');
  cx.fillStyle=g;cx.fill();
  cx.beginPath();cx.lineWidth=Math.max(2,H/44);cx.strokeStyle='#3fd39c';
  cx.lineJoin='round';cx.lineCap='round';
  for(let i=0;i<buf.length;i++){const x=i/(buf.length-1)*W;i?cx.lineTo(x,Y(buf[i])):cx.moveTo(x,Y(buf[i]))}
  cx.stroke()}
setInterval(draw,50);

let fondo=262143;
fetch('/cfg.txt').then(r=>r.text()).then(t=>{$('cfgtxt').textContent=t;
  const m=t.match(/fondo=(\d+)/); if(m)fondo=+m[1];}).catch(()=>{});

/* ---- enlace ---- */
let rtts=[],nSamp=0,lastFps=Date.now(),lastIdx=-1,ws=null,dotT=0,lastRx=Date.now();
function conectar(){ws=new WebSocket('ws://'+location.hostname+':81/');
  ws.onopen=()=>{lastRx=Date.now();$('st').textContent='conectado';$('st').className='sm c-bien'};
  ws.onclose=()=>{$('st').textContent='reconectando…';$('st').className='sm c-ojo';
    setTimeout(conectar,1000)};
  ws.onerror=()=>{try{ws.close()}catch(e){}};
  ws.onmessage=onMsg}
setInterval(()=>{if(ws&&ws.readyState===1)ws.send('{"ping":'+Date.now()+'}')},500);
/* vigilante: si en 3 s no llega NADA el socket esta muerto aunque el navegador
   no lo sepa; se fuerza el cierre y onclose reconecta solo. Sin esto, una
   microcaida del WiFi congelaba la pagina hasta que el TCP caducara (minutos) */
setInterval(()=>{if(ws&&ws.readyState===1&&Date.now()-lastRx>3000){try{ws.close()}catch(e){}}},1000);

function onMsg(e){lastRx=Date.now();const d=JSON.parse(e.data);
  if(d.pong!==undefined){const r=Date.now()-d.pong;rtts.push(r);if(rtts.length>40)rtts.shift();
    const s=[...rtts].sort((a,b)=>a-b);
    $('rtt').innerHTML=s[s.length>>1]+'<span class=u>ms</span>';
    $('lat2').textContent='p95 '+s[Math.min(s.length-1,Math.floor(s.length*.95))]
      +' ms · pérdidas '+d.perd
      +(window._rst>0?' · reinicios del sensor '+window._rst:'');return}
  Rec.push(d);
  if(d.rst!==undefined)window._rst=d.rst;
  if(d.idx!==undefined){if(lastIdx>=0&&d.idx>lastIdx)nSamp+=d.idx-lastIdx;lastIdx=d.idx}
  if(d.ac&&d.ac.length){for(const v of d.ac){buf.push(v);buf.shift()}dirty=true}
  $('pot').innerHTML=d.p+'<span class=u>%</span>';$('tank').style.height=d.p+'%';
  $('pi').innerHTML=d.pi.toFixed(2)+'<span class=u>% PI</span>';
  $('pib').style.width=Math.min(100,d.pi/0.4*100)+'%';
  $('dc').textContent=Math.round(d.dc/fondo*100)+' %';
  $('irb').style.width=Math.min(100,d.dc/fondo*100)+'%';
  $('rn').textContent=Math.round(d.rn);
  $('led').textContent='0x'+d.led.toString(16);
  $('age').innerHTML=d.age+'<span class=u>ms</span>';
  $('cf').textContent=d.g?d.cf:'--';
  const est=$('estado');
  if(d.bl)      {est.className='pill ojo';est.textContent='asentando'}
  else if(d.sat){est.className='pill mal';est.textContent='ADC saturado'}
  else if(d.g)  {est.className='pill ok'; est.textContent='señal buena'}
  else if(d.f)  {est.className='pill ojo';est.textContent='buscando ritmo'}
  else          {est.className='pill';    est.textContent='sin dedo'}
  $('bpm').textContent=d.bm||'--';
  $('bpmi').textContent=d.b||'--';
  $('bpm60').textContent=d.n60;
  $('c60lab').textContent=d.full?'contados 60 s':'contados (aún no 60 s)';
  if(d.i)$('ibi').textContent=d.i;
  if(!d.g){$('bpm').textContent='--';$('bpmi').textContent='--';$('ibi').textContent='--'}
  if(d.beat&&Date.now()-dotT>150){dotT=Date.now();
    $('late').classList.add('on');setTimeout(()=>$('late').classList.remove('on'),120)}
  const now=Date.now();if(now-lastFps>1000){$('fps').textContent=nSamp;nSamp=0;lastFps=now}}

/* ---- grabacion (el modulo compartido hace el trabajo) ---- */
function grabar(){ Rec.alterna($('etiq').value) }
function borrarTodo(){
  if(confirm('¿Borrar todas las sesiones guardadas en el teléfono?'))
    Rec.borra(()=>{$('sesest').textContent='borrado';listar()});
}
function listar(){ Rec.lista(v=>{
  $('seslista').innerHTML = v.length
    ? v.slice(0,6).map(s=>'<div>'+new Date(s.id).toLocaleString()+' · '+s.filas+' filas'
        +(s.etiq?' · <b>'+s.etiq+'</b>':'')+'</div>').join('')
    : 'sin sesiones' }) }
Rec.alCambiar((act,n,msg)=>{
  $('bgrab').textContent = act ? '■ Parar' : '● Grabar';
  $('bgrab').className   = act ? 'btn' : 'btn rec';
  $('etiq').disabled = act;
  if(msg) $('sesest').textContent = msg;
  else if(act) $('sesest').innerHTML = 'GRABANDO · <b>'+n.toLocaleString('es-ES')+'</b> filas'
    + ' · sigue si te vas a la vela';
  else { $('sesest').textContent = n ? ('parada · '+n+' filas guardadas') : 'lista para grabar'; listar() }
});
setTimeout(()=>{ if(Rec.activa()) $('etiq').value=Rec.etiqueta(); listar(); },350);

conectar();
fetch('/estado.json').then(r=>r.json()).then(e=>{
  $('redinfo').innerHTML = e.modo=='estacion'
    ? 'en tu red <b>'+e.red+'</b> · <b>'+e.ip+'</b> · respira.local'
    : 'punto de acceso propio <b>'+e.red+'</b> · sin internet en el móvil';
}).catch(()=>{});
</script></body></html>)HTML";

// ============================================================================
void onWs(uint8_t num, WStype_t type, uint8_t* payload, size_t len) {
  if (type != WStype_TEXT || len == 0 || len > 200) return;
  char in[64];
  size_t n = (len < sizeof(in) - 1) ? len : sizeof(in) - 1;
  memcpy(in, payload, n); in[n] = 0;
  char* p = strstr(in, "\"ping\":");
  if (!p) return;
  p += 7;
  char dig[24]; size_t k = 0;
  while (*p >= '0' && *p <= '9' && k < sizeof(dig) - 1) dig[k++] = *p++;
  if (k == 0) return;
  dig[k] = 0;
  char out[64];
  int m = snprintf(out, sizeof(out), "{\"pong\":%s,\"perd\":%lu}",
                   dig, (unsigned long)perdidasTotal);
  if (m > 0 && m < (int)sizeof(out)) ws.sendTXT(num, out, m);
}

// ------------------------------------------------------ descargas de datos ---
void servirLatidos() {
  int n = (logLatN < (uint32_t)LOG_LAT) ? logLatN : LOG_LAT;
  int ini = (logLatN < (uint32_t)LOG_LAT) ? 0 : logLatHead;
  String s; s.reserve(n * 44 + 120);
  s += "# "; s += cfgSesion; s += "\n";
  s += F("t_ms,ibi_ms,bpm,amp,ir,led,aceptado\n");
  for (int i = 0; i < n; i++) {
    RegLat &r = logLat[(ini + i) % LOG_LAT];
    s += r.ms; s += ',';
    s += r.ibi; s += ',';
    s += (r.ibi > 0 ? 60000 / r.ibi : 0); s += ',';
    s += r.amp; s += ',';
    s += r.ir; s += ',';
    s += r.led; s += ',';
    s += r.ok; s += '\n';
  }
  http.send(200, "text/csv", s);
}

void servirOnda() {
  int n = (logOndaN < (uint32_t)LOG_ONDA) ? logOndaN : LOG_ONDA;
  int ini = (logOndaN < (uint32_t)LOG_ONDA) ? 0 : logOndaHead;
  String s; s.reserve(n * 22 + 120);
  s += "# "; s += cfgSesion; s += "\n";
  s += F("i,ir,filtrado,led\n");
  for (int i = 0; i < n; i++) {
    RegOnda &r = logOnda[(ini + i) % LOG_ONDA];
    s += i; s += ',';
    s += r.ir; s += ',';
    s += r.f; s += ',';
    s += r.led; s += '\n';
  }
  http.send(200, "text/csv", s);
}

// ============================================================================
void configurarSensor() {
  sensor.setup(ledPower, SMP_AVERAGE, LED_MODE, SAMPLE_RATE, PULSE_WIDTH, ADC_RANGE);
  sensor.setPulseAmplitudeRed(0x08);   // el rojo bajo: aqui solo usamos el IR
  sensor.setPulseAmplitudeIR(ledPower);
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n# rESPira MOVIL v9.1  (cadena de senal recalibrada sobre datos reales)");

  pinMode(POT_HI, OUTPUT); digitalWrite(POT_HI, HIGH);
  pinMode(POT_LO, OUTPUT); digitalWrite(POT_LO, LOW);
  analogReadResolution(12);
  analogSetPinAttenuation(POT_W, ADC_11db);

  Wire.begin();
  Wire.setClock(400000);
  sensorOK = sensor.begin(Wire, I2C_SPEED_FAST);
  if (sensorOK) {
    configurarSensor();
    delay(20);
    cfgSesion = leerConfigDelChip();
    Serial.println("# sensor OK");
    Serial.print("# cfg leida del chip: "); Serial.println(cfgSesion);
    // aviso si lo que quedo escrito no es lo que pedimos
    if (cfgSesion.indexOf("bits=18") < 0)
      Serial.println("# AVISO: el ADC no quedo a 18 bits. Revisa PULSE_WIDTH y la libreria.");
    if (cfgSesion.indexOf("fs_fifo=100") < 0)
      Serial.println("# AVISO: el FIFO no quedo a 100 Hz. Revisa SAMPLE_RATE/SMP_AVERAGE.");
  } else {
    Serial.println("# ERROR: sensor no encontrado");
    cfgSesion = "sensor=ausente";
  }
  periodUs = 1e6f / (float)FS_FIFO;
  motor.begin((float)FS_FIFO);

  // La caja negra, antes del WiFi: la primera vez formatea su almacen y
  // tarda unos segundos mas de lo normal. Es solo esa vez.
  noche::begin();

  // --- WiFi: red guardada, o portal para elegirla. Nunca hay que reflashear ---
  red::iniciar();

  http.on("/", []() { http.send_P(200, "text/html", PAGE); });
  http.on("/vela", []() { http.send_P(200, "text/html", VELA); });
  http.on("/pulso", []() { http.send_P(200, "text/html", PULSO); });
  http.on("/latidos.csv", servirLatidos);
  http.on("/onda.csv", servirOnda);
  http.on("/noche.csv", []() { noche::servirCsv(); });
  http.on("/noche/borrar", []() { noche::borrar(); });
  http.on("/cfg.txt", []() { http.send(200, "text/plain", cfgSesion); });
  // el sistema visual y la grabacion, compartidos por las tres paginas
  http.on("/ui.css",    []() { http.send_P(200, "text/css",        UI_CSS); });
  http.on("/grabar.js", []() { http.send_P(200, "application/javascript", REC_JS); });
  http.on("/estado.json", []() {
    char b[160];
    snprintf(b, sizeof(b), "{\"modo\":\"%s\",\"red\":\"%s\",\"ip\":\"%s\"}",
             red::modoAP ? "ap" : "estacion",
             red::redActual.c_str(), red::ipActual.c_str());
    http.send(200, "application/json", b);
  });
  red::rutas(http);
  pot::cargar();
  pot::rutas(http, leerPotCrudo);
  http.onNotFound([]() {
    if (red::modoAP) red::servirPortal(http);
    else http.send_P(200, "text/html", PAGE);
  });
  http.begin();
  ws.begin();
  ws.onEvent(onWs);
  // Latido de protocolo: un movil que se cae sin avisar deja un socket zombi,
  // y CADA broadcast (25/s) se bloqueaba 200 ms en el hasta caducar el TCP
  // (minutos): ese era el congelon. Con esto el zombi se expulsa en ~6 s.
  ws.enableHeartbeat(3000, 1500, 2);
  winStartUs = nowUs();
}

// Crudo del pot con sobremuestreo de 8. La calibracion vive en pot_cal.h
uint16_t leerPotCrudo() {
  long acc = 0;
  for (int i = 0; i < 8; i++) acc += analogRead(POT_W);
  return (uint16_t)(acc / 8);
}

// Como mucho 4 veces por segundo: leerlo en cada vuelta martilleaba el bus I2C
// y ademas contaba mal, porque el registro se limpia al leer el FIFO.
void leerPerdidas(int64_t ahora) {
  static int64_t ultima = 0;
  if (ahora - ultima < 250000) return;
  ultima = ahora;
  uint8_t ovf = leerReg(REG_OVF);
  if (ovf == 0xFF) return;
  ovf &= 0x1F;                          // el contador son 5 bits
  if (ovf > lastOvf) perdidasTotal += (ovf - lastOvf);
  lastOvf = ovf;
}

// PERRO GUARDIAN DEL SENSOR: si pasan 3 s sin una sola muestra, lo reiniciamos.
void vigilarSensor(int64_t ahora) {
  static int64_t ultimaMuestraUs = 0;
  static uint32_t vistas = 0;
  if (muestrasTotal != vistas) { vistas = muestrasTotal; ultimaMuestraUs = ahora; return; }
  if (ultimaMuestraUs == 0) { ultimaMuestraUs = ahora; return; }
  if (ahora - ultimaMuestraUs < 3000000) return;

  Serial.println("# sensor mudo 3 s: reiniciandolo");
  Wire.end(); delay(20);
  Wire.begin(); Wire.setClock(400000);
  sensorOK = sensor.begin(Wire, I2C_SPEED_FAST);
  if (sensorOK) { configurarSensor(); delay(20); cfgSesion = leerConfigDelChip(); }
  motor.hardReset();
  motor.notificarCambioGanancia((uint32_t)(ahora / 1000));
  ultimaMuestraUs = ahora;
  reinicios++;
}

void enviarEstado() {
  int64_t ahora = nowUs();
  bool valido = false;
  int n60 = bpmConteo60(ahora, valido);
  unsigned long ageMs = tSampleUs > 0 ? (unsigned long)((ahora - tSampleUs) / 1000) : 0;

  char ac[200]; int q = 0;
  ac[q++] = '[';
  for (int i = 0; i < nLote && q < (int)sizeof(ac) - 12; i++)
    q += snprintf(ac + q, sizeof(ac) - q, i ? ",%d" : "%d", acLote[i]);
  ac[q++] = ']'; ac[q] = 0;
  nLote = 0;

  char irl[220]; int qi = 0;
  irl[qi++] = '[';
  for (int i = 0; i < nIrLote && qi < (int)sizeof(irl) - 14; i++)
    qi += snprintf(irl + qi, sizeof(irl) - qi, i ? ",%ld" : "%ld", (long)irLote[i]);
  irl[qi++] = ']'; irl[qi] = 0;
  nIrLote = 0;

  char buf[900];
  int len = snprintf(buf, sizeof(buf),
    "{\"idx\":%lu,\"t\":%lu,\"per\":%.3f,\"ir\":%ld,\"irl\":%s,\"ac\":%s,\"dc\":%.0f,"
    "\"amp\":%.0f,\"pi\":%.3f,\"rn\":%.0f,\"led\":%d,\"p\":%d,"
    "\"f\":%d,\"g\":%d,\"sat\":%d,\"b\":%d,\"bm\":%d,\"n60\":%d,\"full\":%d,"
    "\"i\":%d,\"cf\":%d,\"beat\":%d,\"age\":%lu,\"perd\":%lu,\"rej\":%lu,"
    "\"rst\":%lu,\"bl\":%d}",
    (unsigned long)muestrasTotal, (unsigned long)(tSampleUs / 1000), periodUs/1000.0f, lastIR, irl, ac,
    dcAct, ampAct, piAct, rnAct, ledPower, potPct,
    dedo ? 1 : 0, gateAct ? 1 : 0, satUlt ? 1 : 0,
    bpmPend > 0 ? (int)bpmPend : 0, bpmAct, n60, valido ? 1 : 0,
    ibiAct, confAct, beatPend ? 1 : 0, ageMs,
    (unsigned long)perdidasTotal, (unsigned long)rechazados,
    (unsigned long)reinicios, motor.asentando((uint32_t)(ahora / 1000)) ? 1 : 0);

  if (len > 0 && len < (int)sizeof(buf) && ws.connectedClients() > 0)
    ws.broadcastTXT(buf, len);
  beatPend = false;
}

void loop() {
  http.handleClient();
  red::atender();          // portal cautivo, solo hace algo en modo AP
  ws.loop();
  int64_t ahora = nowUs();

  if (ahora - lastPotUs >= 20000) {
    lastPotUs = ahora;
    // El suavizado va en COMA FLOTANTE a proposito: con enteros,
    // (potPct*3 + nuevo)/4 trunca el incremento a cero cuando faltan menos de
    // 4 puntos y el valor se queda clavado (el 97 % en vez de 100 %).
    static float potSuave = -1.0f;
    float p = pot::aplicar(leerPotCrudo());
    if (potSuave < 0) potSuave = p;
    potSuave += 0.25f * (p - potSuave);
    potPct = (int)lroundf(potSuave);
  }

  noche::tick(ahora, potPct, dcAct, piAct, dedo, gateAct, satUlt);

  if (sensorOK) {
    sensor.check();
    leerPerdidas(ahora);
    vigilarSensor(ahora);

    while (sensor.available()) {
      long ir = sensor.getFIFOIR();
      sensor.nextSample();
      lastIR = ir;
      muestrasTotal++; winMuestras++;

      // periodo real medido, para que el reloj de las muestras no derive
      if (ahora - winStartUs > 2000000 && winMuestras > 10) {
        float pm = (float)(ahora - winStartUs) / (float)winMuestras;
        if (pm > 2000 && pm < 200000) periodUs = periodUs * 0.7f + pm * 0.3f;
        winStartUs = ahora; winMuestras = 0;
      }
      tSampleUs = (tSampleUs == 0) ? ahora : tSampleUs + (int64_t)periodUs;
      if (tSampleUs > ahora) tSampleUs = ahora;
      if (ahora - tSampleUs > 300000) tSampleUs = ahora;

      // ---- toda la cadena de senal, en una linea ----
      ppg::Out o = motor.update((uint32_t)ir, ledPower);

      dcAct = o.dc; acAct = o.ac; piAct = o.pi; rnAct = o.rnorm; ampAct = o.amp;
      bpmAct = (int)lroundf(o.bpm); ibiAct = o.ibiMs; confAct = o.conf;
      gateAct = o.gate; satUlt = o.sat;

      if (o.finger != dedo) dedoDesdeUs = o.finger ? tSampleUs : 0;
      dedo = o.finger;

      if (nLote   < 24) acLote[nLote++]   = (int)constrain(o.ac, -32000.0f, 32000.0f);
      if (nIrLote < 24) irLote[nIrLote++] = (int32_t)ir;

      logOnda[logOndaHead] = { (int32_t)ir,
                               (int16_t)constrain(o.ac, -32000.0f, 32000.0f), ledPower };
      logOndaHead = (logOndaHead + 1) % LOG_ONDA;
      logOndaN++;

      if (o.beat) {
        beatPend = true; ibiPend = o.ibiMs; bpmPend = o.bpm;
        beatRing[beatHead] = tSampleUs;
        beatHead = (beatHead + 1) % BEAT_RING;
        if (beatCount < BEAT_RING) beatCount++;
        anotarLatido(o.ibiMs, (int)o.amp, ir, true);
        noche::latido((uint32_t)(tSampleUs / 1000), (uint16_t)o.ibiMs,
                      (uint16_t)constrain(o.amp, 0.0f, 65535.0f));
      }
    }

    // ---- AGC, una vez por vuelta, no una vez por muestra ----
    {
      uint32_t nowMs = (uint32_t)(ahora / 1000);
      uint8_t nuevo = motor.agc(ledPower, nowMs, satUlt);
      if (nuevo != ledPower) {
        ledPower = nuevo;
        sensor.setPulseAmplitudeIR(ledPower);
        motor.notificarCambioGanancia(nowMs);
      }
    }
  }

  if (ahora - lastSendUs >= 40000) {
    lastSendUs = ahora;
    enviarEstado();
  }
}
