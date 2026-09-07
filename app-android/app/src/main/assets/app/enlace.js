/* ============================================================================
 *  rESPira · ENLACE                    la conexión con el sensor por WebSocket
 * ============================================================================
 *  El ESP32 ya no sirve interfaces: solo mide y manda muestras. Esta pieza es
 *  todo lo que la app necesita de él.
 *
 *  DOS LECCIONES aprendidas a base de congelones, que están en el código:
 *    · Un socket puede quedarse MEDIO MUERTO sin que el navegador se entere.
 *      Si en 3 s no llega nada, se cierra a la fuerza y se reconecta. Sin
 *      esto, una microcaída del wifi congelaba la app durante minutos.
 *    · La IP la encuentra la parte nativa (mDNS + barrido) y nos la pasa;
 *      buscarla desde JavaScript no es posible.
 * ========================================================================== */
window.Enlace = (function () {
  'use strict';

  let ws = null, ip = null, reintento = null, vigilante = null;
  let ultimoRx = 0, muerto = true;
  const oyentes = { dato: [], estado: [] };

  const estado = {
    conectado: false, ip: null, dedo: false, calidad: 'sin señal',
    bpm: 0, bpmInst: 0, pot: 0, pi: 0, rnorm: 0, led: 0, sat: false, gate: false,
    rtt: null, p95: null, perdidas: 0, reinicios: 0, muestras: 0, edad: 0,
    modo: '', red: '', cfg: ''
  };

  const rtts = [];

  function al(qué, f) { oyentes[qué].push(f); }
  function avisa(qué, a) { oyentes[qué].forEach(f => { try { f(a); } catch (e) {} }); }

  function conectar(nuevaIp) {
    if (nuevaIp) ip = nuevaIp;
    if (!ip) return;
    cerrar();
    estado.ip = ip;
    try { ws = new WebSocket('ws://' + ip + ':81/'); } catch (e) { reprograma(); return; }

    ws.onopen = () => {
      ultimoRx = Date.now(); muerto = false;
      estado.conectado = true;
      avisa('estado', estado);
      pideEstadoJson();
    };
    ws.onmessage = e => {
      ultimoRx = Date.now();
      let d;
      try { d = JSON.parse(e.data); } catch (err) { return; }
      if (d.pong !== undefined) {
        const r = Date.now() - d.pong;
        rtts.push(r); if (rtts.length > 40) rtts.shift();
        const s = rtts.slice().sort((a, b) => a - b);
        estado.rtt = s[s.length >> 1];
        estado.p95 = s[Math.min(s.length - 1, Math.floor(s.length * .95))];
        estado.perdidas = d.perd || 0;
        return;
      }
      estado.bpm = d.bm || 0; estado.bpmInst = d.b || 0;
      estado.pot = d.p; estado.pi = d.pi; estado.rnorm = d.rn; estado.led = d.led;
      estado.dedo = !!d.f; estado.gate = !!d.g; estado.sat = !!d.sat;
      estado.edad = d.age; estado.muestras = d.idx; estado.reinicios = d.rst || 0;
      estado.calidad = d.bl ? 'asentando' : d.sat ? 'saturado'
                     : d.g ? 'buena' : d.f ? 'buscando ritmo' : 'sin dedo';
      Almacen.anota(d);
      avisa('dato', d);
    };
    ws.onclose = () => { estado.conectado = false; avisa('estado', estado); reprograma(); };
    ws.onerror = () => { try { ws.close(); } catch (e) {} };
  }

  function reprograma() {
    clearTimeout(reintento);
    reintento = setTimeout(() => conectar(), 1200);
  }
  function cerrar() {
    clearTimeout(reintento);
    if (ws) { try { ws.onclose = null; ws.close(); } catch (e) {} ws = null; }
  }

  // latido de ida y vuelta, para medir latencia y mantener vivo el socket
  setInterval(() => {
    if (ws && ws.readyState === 1) ws.send('{"ping":' + Date.now() + '}');
  }, 500);

  // el vigilante: 3 s sin recibir nada = el socket está muerto aunque no lo diga
  vigilante = setInterval(() => {
    if (ws && ws.readyState === 1 && Date.now() - ultimoRx > 3000) {
      try { ws.close(); } catch (e) {}
    }
  }, 1000);

  /* Datos que no vienen por el socket. Se piden por HTTP; la app se carga
     desde los propios ficheros de la APK, así que esto es una petición a otro
     origen — el WebView la permite porque la app lo tiene habilitado. */
  function pide(ruta, cuando, comoTexto) {
    if (!ip) return;
    fetch('http://' + ip + ruta)
      .then(r => comoTexto ? r.text() : r.json())
      .then(cuando)
      .catch(() => {});
  }
  function pideEstadoJson() {
    pide('/estado.json', j => { estado.modo = j.modo; estado.red = j.red; avisa('estado', estado); });
    pide('/cfg.txt', t => { estado.cfg = t; }, true);
  }

  /* La parte nativa nos avisa cuando encuentra el sensor. */
  window.rESPira = window.rESPira || {};
  window.rESPira.sensor = function (nuevaIp) {
    if (nuevaIp && nuevaIp !== ip) conectar(nuevaIp);
    else if (!estado.conectado) conectar(nuevaIp);
  };
  window.rESPira.buscando = function () {
    estado.conectado = false; estado.calidad = 'buscando el sensor…';
    avisa('estado', estado);
  };

  function buscar() {
    if (window.RespiraAndroid && RespiraAndroid.buscarSensor) RespiraAndroid.buscarSensor();
  }

  return { conectar, cerrar, al, buscar, pide, estado,
           get url() { return ip ? 'http://' + ip : null; } };
})();
