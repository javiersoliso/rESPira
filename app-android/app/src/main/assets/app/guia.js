/* ============================================================================
 *  rESPira · GUÍA                     el reloj que lleva una sesión guiada
 * ============================================================================
 *  Lee la práctica (fases, pasos o rondas) y va marcando qué toca: mueve el
 *  aro, dispara el sonido y avisa a la pantalla. Tres formas de sesión:
 *
 *    fases   ciclo fijo que se repite     (coherencia, 4·7·8, caja)
 *    pasos   escalones de ritmo distinto  (encontrar tu ritmo)
 *    rondas  objetivo por ronda           (zumbido largo)
 *    libre   no guía nada, solo mide      (vela, silencio, noche)
 *
 *  El reloj va sobre performance.now(), no sobre contadores: así no se
 *  desfasa si el teléfono se ralentiza un momento.
 * ========================================================================== */
window.Guia = (function () {
  'use strict';

  let practica = null, plan = null, i = 0, t0 = 0, tIni = 0;
  let raf = null, corriendo = false, alCambiar = null, alTerminar = null;

  const ETIQ = { inhala: 'inhala', exhala: 'exhala', reten: 'retén', vacio: 'vacío',
                 zumba: 'zumba', descansa: 'descansa', libre: 'respira' };

  /* Convierte cualquier práctica en una lista plana de fases con duración. */
  function planificar(p, ajustes) {
    const out = [];
    if (p.fases) {
      const escala = (p.rpmDeUsuario && ajustes.rpm) ? p.rpm / ajustes.rpm : 1;
      const ciclos = p.ciclos || Math.round(p.minutos * 60 /
        (p.fases.reduce((s, f) => s + f[1], 0) * escala));
      for (let c = 0; c < ciclos; c++)
        p.fases.forEach(f => out.push({ n: f[0], seg: +(f[1] * escala).toFixed(2), ciclo: c + 1,
                                        ciclos: ciclos }));
    } else if (p.pasos) {
      p.pasos.forEach((paso, k) => {
        const dentro = 60 / paso.rpm * 0.45, fuera = 60 / paso.rpm * 0.55;
        const n = Math.round(paso.seg / (dentro + fuera));
        for (let c = 0; c < n; c++) {
          out.push({ n: 'inhala', seg: +dentro.toFixed(2), paso: k + 1, pasos: p.pasos.length, rpm: paso.rpm });
          out.push({ n: 'exhala', seg: +fuera.toFixed(2), paso: k + 1, pasos: p.pasos.length, rpm: paso.rpm });
        }
      });
    } else if (p.rondas) {
      const base = ajustes.record || 20;
      p.rondas.forEach((r, k) => {
        const meta = Math.round(base * r.objetivo);
        out.push({ n: 'inhala', seg: 5, ronda: k + 1, rondas: p.rondas.length, meta: meta });
        out.push({ n: 'zumba', seg: meta, ronda: k + 1, rondas: p.rondas.length, meta: meta,
                   abierta: true });
        out.push({ n: 'descansa', seg: r.descanso, ronda: k + 1, rondas: p.rondas.length });
      });
    } else {
      out.push({ n: 'libre', seg: p.minutos * 60, abierta: true });
    }
    return out;
  }

  function empezar(p, ajustes, cb) {
    practica = p;
    plan = planificar(p, ajustes || {});
    alCambiar = cb.alCambiar; alTerminar = cb.alTerminar;
    i = -1; corriendo = true;
    tIni = performance.now();
    if (cb.conSonido) Sonido.iniciar(cb.voz);
    siguiente(tIni);
    raf = requestAnimationFrame(tic);
    return plan;
  }

  function siguiente(ahora) {
    i++;
    if (i >= plan.length) { terminar(); return; }
    t0 = ahora;
    const f = plan[i];
    if (Sonido.activo) Sonido.fase(f.n === 'zumba' ? 'exhala'
                                 : f.n === 'descansa' || f.n === 'libre' ? 'reten' : f.n, f.seg);
  }

  function tic(ahora) {
    if (!corriendo) return;
    const f = plan[i];
    if (!f) { terminar(); return; }
    const t = (ahora - t0) / 1000;
    if (t >= f.seg && !f.abierta) siguiente(ahora);
    else {
      const u = Math.min(1, t / f.seg);
      // el tamaño del aro: crece al inhalar, se queda al retener, baja al soltar
      let escala = 1;
      if (f.n === 'inhala') escala = 0.52 + 0.48 * u;
      else if (f.n === 'exhala' || f.n === 'zumba') escala = 1 - 0.48 * Math.min(1, u);
      else if (f.n === 'reten') escala = 1;
      else if (f.n === 'vacio') escala = 0.52;
      else escala = 0.52 + 0.48 * (0.5 + 0.5 * Math.sin(ahora / 3000));
      alCambiar({
        fase: f.n, etiqueta: ETIQ[f.n] || f.n,
        restante: f.abierta ? t : Math.max(0, f.seg - t),
        cuentaArriba: !!f.abierta,
        escala: escala, meta: f.meta || null,
        rotulo: f.paso ? `ritmo ${f.paso} de ${f.pasos} · ${String(f.rpm).replace('.', ',')} rpm`
              : f.ronda ? `ronda ${f.ronda} de ${f.rondas}`
              : f.ciclo ? `ciclo ${f.ciclo} de ${f.ciclos}` : '',
        transcurrido: (ahora - tIni) / 1000
      });
    }
    raf = requestAnimationFrame(tic);
  }

  /* En las fases abiertas (zumbido, sesión libre) el usuario decide cuándo
     acaba: un toque pasa a la siguiente. */
  function avanzar() { if (corriendo) siguiente(performance.now()); }

  function terminar() {
    if (!corriendo) return;
    corriendo = false;
    cancelAnimationFrame(raf);
    if (Sonido.activo) Sonido.parar();
    const dur = (performance.now() - tIni) / 1000;
    alTerminar && alTerminar(dur);
  }

  return { empezar, terminar, avanzar, planificar,
           get corriendo() { return corriendo; },
           get practica() { return practica; } };
})();
