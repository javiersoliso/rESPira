/* ============================================================================
 *  rESPira · SONIDO            síntesis procedural, gobernada por una VOZ
 * ============================================================================
 *  Nada de ficheros de audio: todo se genera en el momento. Y nada de sonidos
 *  cableados en el código: el motor no sabe a qué suena una campana — lee la
 *  voz que le den (ver voces.js) y la construye.
 *
 *  Para diseñar un sonido nuevo NO se toca este fichero: se escribe otro
 *  objeto voz y se pasa a cargarVoz(). El editor en vivo hace justo eso.
 *
 *      Sonido.iniciar();
 *      Sonido.cargarVoz(Voces.mar);
 *      Sonido.fase('inhala', 5.0);
 *
 *  Para qué sirve: si el sonido te guía, la sesión se hace con los OJOS
 *  CERRADOS y la pantalla deja de hacer falta.
 * ========================================================================== */
window.Sonido = (function () {
  'use strict';

  let ctx = null, maestro = null, seco = null, mojado = null, rev = null;
  let capas = null, voz = null, vivo = false;
  let opciones = { campana: true, textura: true, dron: true, binaural: false, volumen: 0.7 };
  const bufs = {};

  /* ------------------------------------------------------------- ruidos --
     Blanco: plano, suena a estática. Rosa: −3 dB por octava, es el del mar y
     el de la respiración. Marrón: −6 dB, más grave y envolvente todavía. */
  function bufferRuido(tipo, seg) {
    const clave = tipo + seg;
    if (bufs[clave]) return bufs[clave];
    const n = Math.floor(ctx.sampleRate * seg);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    if (tipo === 'blanco') {
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
    } else if (tipo === 'marron') {
      let u = 0;
      for (let i = 0; i < n; i++) {
        u = (u + (Math.random() * 2 - 1) * 0.02) / 1.02;
        d[i] = u * 3.2;
      }
    } else {                                        // rosa (Voss-McCartney)
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;  b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;  b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;  b5 = -0.7616 * b5 - w * 0.0168980;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    }
    bufs[clave] = buf;
    return buf;
  }

  /* Sala sintética: ruido con caída exponencial. Una reverberación grabada
     ocupa megas; esta ocupa cinco líneas. */
  function impulso(seg) {
    const n = Math.floor(ctx.sampleRate * seg);
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6);
    }
    return b;
  }

  /* ------------------------------------------------------------ arranque -- */
  function iniciar(v) {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      maestro = ctx.createGain();
      maestro.gain.value = opciones.volumen;
      rev = ctx.createConvolver();
      seco = ctx.createGain();
      mojado = ctx.createGain();
      maestro.connect(seco).connect(ctx.destination);
      maestro.connect(rev).connect(mojado).connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    cargarVoz(v || voz || window.Voces.cuenco);
    vivo = true;
  }

  /* Reconstruye el grafo con la voz nueva. Se puede llamar en caliente: el
     editor lo hace en cada cambio de mando. */
  function cargarVoz(v) {
    if (!ctx) { voz = v; return; }
    if (capas) {
      try { capas.fuente.stop(); } catch (e) {}
      [capas.gTex, capas.gDron, capas.gBin].forEach(g => { try { g.disconnect(); } catch (e) {} });
      capas.osc.forEach(o => { try { o.stop(); } catch (e) {} });
    }
    voz = v;
    rev.buffer = impulso(v.sala.seg);
    mojado.gain.value = v.sala.mojado;
    seco.gain.value = v.sala.seco;

    capas = { osc: [] };

    // --- textura: el ruido que respira ---
    const t = v.textura;
    const fuente = ctx.createBufferSource();
    fuente.buffer = bufferRuido(t.ruido, 8);
    fuente.loop = true;
    const filtro = ctx.createBiquadFilter();
    filtro.type = t.filtro;
    filtro.frequency.value = t.reten.hz || 500;
    filtro.Q.value = t.q;
    const gTex = ctx.createGain(); gTex.gain.value = 0;
    const espacio = ctx.createPanner();
    espacio.panningModel = 'HRTF';
    espacio.positionX.value = 0; espacio.positionY.value = 0; espacio.positionZ.value = -1;
    fuente.connect(filtro).connect(gTex).connect(espacio).connect(maestro);
    fuente.start();
    Object.assign(capas, { fuente: fuente, filtro: filtro, gTex: gTex, espacio: espacio });

    // --- dron ---
    const gDron = ctx.createGain(); gDron.gain.value = 0;
    v.dron.voces.forEach(([mul, amp, det]) => {
      const o = ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = v.dron.nota * mul; o.detune.value = det;
      const g = ctx.createGain(); g.gain.value = amp;
      o.connect(g).connect(gDron); o.start();
      capas.osc.push(o);
    });
    gDron.connect(maestro);
    capas.gDron = gDron;

    // --- binaural: dos tonos con 7 Hz de diferencia, uno por oído ---
    const gBin = ctx.createGain(); gBin.gain.value = 0;
    [[v.dron.nota * 2, -1], [v.dron.nota * 2 + 7, 1]].forEach(([f, lado]) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const p = ctx.createStereoPanner(); p.pan.value = lado;
      o.connect(p).connect(gBin); o.start();
      capas.osc.push(o);
    });
    gBin.connect(maestro);
    capas.gBin = gBin;
  }

  /* ------------------------------------------------------------- campana -- */
  function campana(base, fuerza) {
    if (!ctx || !opciones.campana || !voz) return;
    const c = voz.campana;
    base = base || c.base;
    fuerza = fuerza == null ? 0.5 : fuerza;
    const t = ctx.currentTime;
    const g = ctx.createGain(); g.gain.value = c.volumen * fuerza;
    g.connect(maestro);
    c.parciales.forEach(([mul, amp, cola]) => {
      const o = ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = base * mul;
      const ga = ctx.createGain();
      ga.gain.setValueAtTime(0, t);
      ga.gain.linearRampToValueAtTime(amp, t + c.golpe);
      ga.gain.exponentialRampToValueAtTime(0.0001, t + cola);
      o.connect(ga).connect(g);
      o.start(t); o.stop(t + cola + 0.1);
    });
    if (c.batido) {                    // el batido leve da el vaivén del metal
      const o = ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = base * c.batido.mul;
      const ga = ctx.createGain();
      ga.gain.setValueAtTime(0, t);
      ga.gain.linearRampToValueAtTime(c.batido.amp, t + c.golpe * 1.6);
      ga.gain.exponentialRampToValueAtTime(0.0001, t + c.batido.cola);
      o.connect(ga).connect(g);
      o.start(t); o.stop(t + c.batido.cola + 0.1);
    }
  }

  /* ---------------------------------------------------------------- fases -- */
  function fase(nombre, dur) {
    if (!vivo || !voz) return;
    const clave = (nombre === 'reten' || nombre === 'vacio') ? 'reten' : nombre;
    const t = ctx.currentTime, fin = t + Math.max(0.3, dur);
    const dst = voz.textura[clave], dr = voz.dron;
    const rampa = (par, v) => {
      par.cancelScheduledValues(t);
      par.setValueAtTime(par.value, t);
      par.linearRampToValueAtTime(v, fin);
    };

    if (voz.campana.porFase[clave]) campana(voz.campana.porFase[clave],
      clave === 'inhala' ? 0.34 : clave === 'exhala' ? 0.28 : 0.18);

    if (dst) {
      if (dst.hz) rampa(capas.filtro.frequency, dst.hz);
      rampa(capas.gTex.gain, opciones.textura ? dst.gan : 0);
      if (dst.y != null) rampa(capas.espacio.positionY, dst.y);
      if (dst.z != null) rampa(capas.espacio.positionZ, dst.z);
    }
    rampa(capas.gDron.gain, opciones.dron ? (dr[clave] != null ? dr[clave] : 0.1) : 0);
    rampa(capas.gBin.gain, opciones.binaural ? 0.035 : 0);
  }

  function ajustar(o) {
    Object.assign(opciones, o);
    if (!ctx || !capas) return;
    const t = ctx.currentTime;
    maestro.gain.setTargetAtTime(opciones.volumen, t, 0.15);
    if (!opciones.dron) capas.gDron.gain.setTargetAtTime(0, t, 0.4);
    if (!opciones.textura) capas.gTex.gain.setTargetAtTime(0, t, 0.4);
    if (!opciones.binaural) capas.gBin.gain.setTargetAtTime(0, t, 0.4);
  }

  function parar() {
    if (!ctx || !capas) return;
    const t = ctx.currentTime;
    [capas.gTex, capas.gDron, capas.gBin].forEach(g => {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + 1.6);
    });
    campana(voz.campana.base, 0.42);
  }

  function probar(v) { iniciar(v); campana(null, 0.55); }

  return { iniciar, cargarVoz, parar, fase, campana, ajustar, probar,
           get voz() { return voz; },
           get opciones() { return opciones; },
           get activo() { return vivo; } };
})();
