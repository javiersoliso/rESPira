/* ============================================================================
 *  rESPira · INFORME              gráficas SVG + redacción, sin dependencias
 * ============================================================================
 *  Toma la salida de Motor.analizar() y devuelve el HTML del informe.
 *  Las gráficas son SVG generado a mano: nada de librerías, funciona sin
 *  internet y pesa cero.
 * ========================================================================== */
window.Informe = (function () {
  'use strict';

  const C = { pulso: '#3fd39c', pulsoS: '#199e70', aire: '#6fb2f5', aireS: '#3987e5',
              rito: '#f0b93c', ritoS: '#c98500', mal: '#e66767',
              linea: '#1e2b39', tx3: '#5f7488', tx2: '#9cb0c2', sup: '#0e151d' };

  const esc = s => String(s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const mmss = s => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');
  const duracion = s => s < 90 ? Math.round(s) + ' s'
    : s < 5400 ? Math.round(s / 60) + ' min'
    : Math.floor(s / 3600) + ' h ' + String(Math.round(s % 3600 / 60)).padStart(2, '0');
  const n1 = v => isFinite(v) ? v.toFixed(1).replace('.', ',') : '—';
  const n0 = v => isFinite(v) ? Math.round(v).toString() : '—';

  /* ------------------------------------------------------------ utilidad -- */
  function ejes(w, h, m) {
    return {
      x: (v, lo, hi) => m.l + (v - lo) / (hi - lo || 1) * (w - m.l - m.r),
      y: (v, lo, hi) => h - m.b - (v - lo) / (hi - lo || 1) * (h - m.t - m.b)
    };
  }
  const ruta = pts => pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');

  /* ============================================ 1 · línea temporal ======== */
  function gTiempo(inf) {
    const W = 640, H = 200, m = { l: 40, r: 14, t: 16, b: 26 };
    const pm = inf.porMinuto;
    if (pm.length < 3) return '';
    const e = ejes(W, H, m);
    const hrs = pm.map(p => p.hr);
    let lo = Math.min.apply(null, hrs) - 3, hi = Math.max.apply(null, hrs) + 3;
    const T = inf.dur;
    const pts = pm.map(p => [e.x(p.t, 0, T), e.y(p.hr, lo, hi)]);
    const area = ruta(pts) + `L${e.x(T,0,T).toFixed(1)},${H - m.b} L${m.l},${H - m.b} Z`;

    // retenciones como bandas verticales
    let bandas = '';
    inf.eventos.filter(v => v.tipo === 'retencion').forEach(v => {
      const x0 = e.x(v.t, 0, T), x1 = e.x(v.t + v.dur, 0, T);
      bandas += `<rect x="${x0.toFixed(1)}" y="${m.t}" width="${Math.max(1.5, x1 - x0).toFixed(1)}"
        height="${H - m.t - m.b}" fill="${C.aireS}" opacity=".20"/>`;
    });
    let rejilla = '', etq = '';
    for (let k = 0; k <= 4; k++) {
      const v = lo + (hi - lo) * k / 4, y = e.y(v, lo, hi);
      rejilla += `<line x1="${m.l}" y1="${y.toFixed(1)}" x2="${W - m.r}" y2="${y.toFixed(1)}"
        stroke="${C.linea}" stroke-width=".7"/>`;
      etq += `<text x="${m.l - 6}" y="${(y + 3.5).toFixed(1)}" fill="${C.tx3}" font-size="9"
        text-anchor="end">${Math.round(v)}</text>`;
    }
    let ejeX = '';
    const pasoX = T > 900 ? 300 : T > 300 ? 120 : 60;
    for (let t = 0; t <= T; t += pasoX)
      ejeX += `<text x="${e.x(t, 0, T).toFixed(1)}" y="${H - 8}" fill="${C.tx3}" font-size="9"
        text-anchor="middle">${mmss(t)}</text>`;

    return `<svg viewBox="0 0 ${W} ${H}" class="gr" role="img"
      aria-label="pulso a lo largo de la sesión, con las retenciones marcadas">
      <defs><linearGradient id="gT" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${C.pulsoS}" stop-opacity=".30"/>
        <stop offset="100%" stop-color="${C.pulsoS}" stop-opacity="0"/></linearGradient></defs>
      ${rejilla}${bandas}
      <path d="${area}" fill="url(#gT)"/>
      <path d="${ruta(pts)}" fill="none" stroke="${C.pulso}" stroke-width="2"
        stroke-linejoin="round" stroke-linecap="round"/>
      ${etq}${ejeX}
      <text x="${m.l}" y="11" fill="${C.tx3}" font-size="9">lpm</text></svg>`;
  }

  /* ====================================== 2 · acoplamiento respiración ==== */
  /* La prueba visual de que el corazón "respira": la oscilación del intervalo
     entre latidos contra el movimiento real del pecho, en el mejor tramo. */
  function gAcople(inf) {
    if (!inf.pot || inf.pot.length < 100) return '';
    let mejor = null;
    for (const p of inf.serie) if (isFinite(p.coherencia) && (!mejor || p.coherencia > mejor.coherencia)) mejor = p;
    if (!mejor) return '';
    const T0 = Math.max(0, mejor.t - 60), T1 = Math.min(inf.dur, T0 + 120);

    const W = 640, H = 150, m = { l: 14, r: 14, t: 14, b: 24 };
    const e = ejes(W, H, m);
    const norm = a => {
      const mu = a.reduce((s, v) => s + v, 0) / a.length;
      const sd = Math.sqrt(a.reduce((s, v) => s + (v - mu) * (v - mu), 0) / a.length) || 1;
      return a.map(v => (v - mu) / sd);
    };
    // pecho
    const i0 = Math.floor(T0 * inf.fsPot), i1 = Math.floor(T1 * inf.fsPot);
    const po = Array.from(inf.pot.slice(i0, i1));
    if (po.length < 20) return '';
    const pz = norm(po);
    const pPts = pz.map((v, i) => [e.x(T0 + i / inf.fsPot, T0, T1), e.y(v, -2.6, 2.6)]);
    // intervalo entre latidos
    const bt = [], bv = [];
    for (let i = 0; i < inf.ibi.t.length; i++)
      if (inf.ibi.t[i] >= T0 && inf.ibi.t[i] <= T1) { bt.push(inf.ibi.t[i]); bv.push(inf.ibi.ibi[i] * 1000); }
    if (bv.length < 10) return '';
    const bz = norm(bv);
    const bPts = bt.map((t, i) => [e.x(t, T0, T1), e.y(bz[i], -2.6, 2.6)]);

    return `<svg viewBox="0 0 ${W} ${H}" class="gr" role="img"
      aria-label="el pecho y el intervalo entre latidos oscilan a la vez">
      <path d="${ruta(pPts)}" fill="none" stroke="${C.aire}" stroke-width="2"
        stroke-linejoin="round" opacity=".95"/>
      <path d="${ruta(bPts)}" fill="none" stroke="${C.pulso}" stroke-width="2"
        stroke-linejoin="round"/>
      <text x="${m.l}" y="${H - 7}" fill="${C.aire}" font-size="9.5">pecho (cinturón)</text>
      <text x="${m.l + 108}" y="${H - 7}" fill="${C.pulso}" font-size="9.5">intervalo entre latidos</text>
      <text x="${W - m.r}" y="${H - 7}" fill="${C.tx3}" font-size="9" text-anchor="end">
        min ${(T0 / 60).toFixed(0)}–${(T1 / 60).toFixed(0)} · 2 min</text></svg>`;
  }

  /* ================================================= 3 · espectro ========= */
  /* Dónde está la energía de tu variabilidad. Respirar a ritmo fijo la
     concentra en una punta; respirar irregular la reparte. */
  function gEspectro(inf) {
    const g = Motor.metricas(inf.ibi.ibi, inf.ibi.t, inf.ibi.dif, inf.ibi.tDif, 0, inf.dur);
    if (!g || !g.espectro || !g.espectro.f.length) return '';
    const esp = g.espectro;
    const W = 640, H = 170, m = { l: 40, r: 14, t: 16, b: 30 };
    const e = ejes(W, H, m);
    const F0 = 0.02, F1 = 0.42;
    let hi = 0;
    for (let k = 0; k < esp.f.length; k++) if (esp.f[k] >= F0 && esp.f[k] <= F1) hi = Math.max(hi, esp.p[k]);
    if (hi <= 0) return '';
    const pts = [];
    for (let k = 0; k < esp.f.length; k++)
      if (esp.f[k] >= F0 && esp.f[k] <= F1) pts.push([e.x(esp.f[k], F0, F1), e.y(esp.p[k], 0, hi)]);
    const area = ruta(pts) + `L${pts[pts.length-1][0].toFixed(1)},${H-m.b} L${pts[0][0].toFixed(1)},${H-m.b} Z`;

    // bandas clásicas
    const bandas = [[0.04, 0.15, 'LF · ondas lentas'], [0.15, 0.40, 'HF · respiratoria']];
    let bg = '';
    bandas.forEach(([a, b, et], i) => {
      const x0 = e.x(Math.max(a, F0), F0, F1), x1 = e.x(Math.min(b, F1), F0, F1);
      bg += `<rect x="${x0.toFixed(1)}" y="${m.t}" width="${(x1 - x0).toFixed(1)}"
        height="${H - m.t - m.b}" fill="${i ? C.pulsoS : C.ritoS}" opacity=".08"/>
        <text x="${((x0 + x1) / 2).toFixed(1)}" y="${m.t + 11}" fill="${C.tx3}" font-size="8.5"
        text-anchor="middle">${et}</text>`;
    });
    // marca del pico
    let pico = '';
    if (isFinite(g.rpm)) {
      const f = g.rpm / 60;
      if (f >= F0 && f <= F1) {
        const x = e.x(f, F0, F1);
        pico = `<line x1="${x.toFixed(1)}" y1="${m.t}" x2="${x.toFixed(1)}" y2="${H - m.b}"
          stroke="${C.aire}" stroke-width="1.4" stroke-dasharray="3 3"/>
          <text x="${(x + 5).toFixed(1)}" y="${m.t + 26}" fill="${C.aire}" font-size="10">
          tu respiración · ${n1(g.rpm)} rpm</text>`;
      }
    }
    let ejeX = '';
    [0.05, 0.1, 0.2, 0.3, 0.4].forEach(f => {
      ejeX += `<text x="${e.x(f, F0, F1).toFixed(1)}" y="${H - 15}" fill="${C.tx3}" font-size="9"
        text-anchor="middle">${f}</text>
        <text x="${e.x(f, F0, F1).toFixed(1)}" y="${H - 4}" fill="${C.tx3}" font-size="8"
        text-anchor="middle">${Math.round(f * 60)} rpm</text>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" class="gr" role="img"
      aria-label="espectro de la variabilidad del pulso">
      <defs><linearGradient id="gE" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${C.pulsoS}" stop-opacity=".38"/>
        <stop offset="100%" stop-color="${C.pulsoS}" stop-opacity="0"/></linearGradient></defs>
      ${bg}<path d="${area}" fill="url(#gE)"/>
      <path d="${ruta(pts)}" fill="none" stroke="${C.pulso}" stroke-width="1.8"/>
      ${pico}<line x1="${m.l}" y1="${H - m.b}" x2="${W - m.r}" y2="${H - m.b}"
        stroke="${C.linea}"/>${ejeX}
      <text x="${m.l}" y="11" fill="${C.tx3}" font-size="9">energía · Hz</text></svg>`;
  }

  /* ============================================= 4 · coherencia en tiempo == */
  function gCoherencia(inf) {
    const s = inf.serie.filter(p => isFinite(p.coherencia));
    if (s.length < 4) return '';
    const W = 640, H = 120, m = { l: 40, r: 14, t: 12, b: 24 };
    const e = ejes(W, H, m);
    const T = inf.dur;
    const barra = (W - m.l - m.r) / s.length;
    let bars = '';
    s.forEach(p => {
      const x = e.x(p.t, 0, T), y = e.y(p.coherencia, 0, 100);
      const col = p.coherencia > 55 ? C.pulso : p.coherencia > 30 ? C.pulsoS : C.tx3;
      bars += `<rect x="${(x - barra * .38).toFixed(1)}" y="${y.toFixed(1)}"
        width="${(barra * .76).toFixed(1)}" height="${(H - m.b - y).toFixed(1)}"
        rx="2" fill="${col}" opacity=".9"/>`;
    });
    let ref = '';
    [30, 55].forEach(v => {
      const y = e.y(v, 0, 100);
      ref += `<line x1="${m.l}" y1="${y.toFixed(1)}" x2="${W - m.r}" y2="${y.toFixed(1)}"
        stroke="${C.linea}" stroke-dasharray="3 4"/>
        <text x="${m.l - 6}" y="${(y + 3.5).toFixed(1)}" fill="${C.tx3}" font-size="9"
        text-anchor="end">${v}</text>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" class="gr" role="img"
      aria-label="coherencia a lo largo de la sesión">${ref}${bars}
      <text x="${m.l}" y="${H - 6}" fill="${C.tx3}" font-size="9">inicio</text>
      <text x="${W - m.r}" y="${H - 6}" fill="${C.tx3}" font-size="9" text-anchor="end">final</text>
      <text x="${m.l}" y="9" fill="${C.tx3}" font-size="9">% coherencia</text></svg>`;
  }

  /* ================================================= 5 · Poincaré ========= */
  function gPoincare(inf) {
    const x = [], y = [];
    const t = inf.ibi.t, v = inf.ibi.ibi;
    for (let i = 1; i < v.length; i++)
      if (t[i] - t[i - 1] < 3) { x.push(v[i - 1] * 1000); y.push(v[i] * 1000); }
    if (x.length < 30) return '';
    const lo = Math.min(Motor.percentil(x, .01), Motor.percentil(y, .01)) - 60;
    const hi = Math.max(Motor.percentil(x, .99), Motor.percentil(y, .99)) + 60;
    const W = 300, H = 300, m = { l: 40, r: 12, t: 12, b: 34 };
    const e = ejes(W, H, m);
    let pts = '';
    for (let i = 0; i < x.length; i++)
      pts += `<circle cx="${e.x(x[i], lo, hi).toFixed(1)}" cy="${e.y(y[i], lo, hi).toFixed(1)}"
        r="2.4" fill="${C.pulso}" opacity=".38"/>`;
    return `<svg viewBox="0 0 ${W} ${H}" class="gr" role="img"
      aria-label="cada latido frente al siguiente">
      <line x1="${e.x(lo,lo,hi)}" y1="${e.y(lo,lo,hi)}" x2="${e.x(hi,lo,hi)}" y2="${e.y(hi,lo,hi)}"
        stroke="${C.linea}" stroke-dasharray="4 4"/>${pts}
      <text x="${W/2}" y="${H-8}" fill="${C.tx3}" font-size="10" text-anchor="middle">
        intervalo n (ms)</text>
      <text x="12" y="${H/2}" fill="${C.tx3}" font-size="10" text-anchor="middle"
        transform="rotate(-90 12 ${H/2})">intervalo n+1 (ms)</text></svg>`;
  }

  /* ========================================= 6 · curva de resonancia ====== */
  /* La gráfica que decide tu ritmo: cuánto oscila tu corazón a cada ritmo de
     respiración. La joroba es la resonancia. */
  function gResonancia(res) {
    const c = res.curva;
    if (!c || c.length < 3) return '';
    const W = 640, H = 230, m = { l: 46, r: 16, t: 18, b: 42 };
    const e = ejes(W, H, m);
    const X0 = Math.min.apply(null, c.map(p => p.rpm)) - 0.4;
    const X1 = Math.max.apply(null, c.map(p => p.rpm)) + 0.4;
    const Y1 = Math.max.apply(null, c.map(p => p.rsa)) * 1.18;
    const pts = c.map(p => [e.x(p.rpm, X0, X1), e.y(p.rsa, 0, Y1)]);

    let rejilla = '', etq = '';
    for (let k = 0; k <= 3; k++) {
      const v = Y1 * k / 3, y = e.y(v, 0, Y1);
      rejilla += `<line x1="${m.l}" y1="${y.toFixed(1)}" x2="${W - m.r}" y2="${y.toFixed(1)}"
        stroke="${C.linea}" stroke-width=".7"/>`;
      etq += `<text x="${m.l - 7}" y="${(y + 3.5).toFixed(1)}" fill="${C.tx3}" font-size="9"
        text-anchor="end">${Math.round(v)}</text>`;
    }
    let marcas = '', ejeX = '';
    c.forEach((p, i) => {
      const x = pts[i][0], y = pts[i][1];
      marcas += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" fill="${C.pulso}"
        stroke="${C.sup}" stroke-width="1.5"/>`;
      ejeX += `<text x="${x.toFixed(1)}" y="${H - 24}" fill="${C.tx3}" font-size="9"
        text-anchor="middle">${n1(p.rpm)}</text>
        <text x="${x.toFixed(1)}" y="${H - 13}" fill="${C.linea === '' ? C.tx3 : C.tx3}"
        font-size="7.5" text-anchor="middle" opacity=".8">${Math.round(p.segundos)}s</text>`;
    });

    let pico = '';
    if (res.pico) {
      const x = e.x(res.pico.rpm, X0, X1);
      const col = res.pico.confianza === 'buena' ? C.pulso
                : res.pico.confianza === 'media' ? C.rito : C.tx3;
      pico = `<line x1="${x.toFixed(1)}" y1="${m.t}" x2="${x.toFixed(1)}" y2="${H - m.b}"
        stroke="${col}" stroke-width="1.6" stroke-dasharray="4 3"/>
        <text x="${x.toFixed(1)}" y="${m.t - 5}" fill="${col}" font-size="11"
        text-anchor="middle" font-weight="600">${n1(res.pico.rpm)} rpm</text>`;
    }
    return `<svg viewBox="0 0 ${W} ${H}" class="gr" role="img"
      aria-label="cuánto oscila el pulso a cada ritmo de respiración">
      <defs><linearGradient id="gR" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${C.pulsoS}" stop-opacity=".26"/>
        <stop offset="100%" stop-color="${C.pulsoS}" stop-opacity="0"/></linearGradient></defs>
      ${rejilla}
      <path d="${ruta(pts)}L${pts[pts.length-1][0].toFixed(1)},${H-m.b}
        L${pts[0][0].toFixed(1)},${H-m.b}Z" fill="url(#gR)"/>
      <path d="${ruta(pts)}" fill="none" stroke="${C.pulso}" stroke-width="2.2"
        stroke-linejoin="round"/>
      ${pico}${marcas}${etq}${ejeX}
      <text x="${m.l}" y="12" fill="${C.tx3}" font-size="9">oscilación del pulso (ms)</text>
      <text x="${W / 2}" y="${H - 2}" fill="${C.tx3}" font-size="9.5" text-anchor="middle">
        ritmo de respiración (rpm)</text></svg>`;
  }

  /* Informe entero de la sesión de resonancia. */
  function renderResonancia(inf, res) {
    const p = res.pico;
    const conf = { buena: ['ok', 'fiable'], media: ['ojo', 'aproximado'], baja: ['mal', 'poco fiable'] };
    const cc = p ? conf[p.confianza] : conf.baja;
    return `
<div class="inf">
  <div class="inf-cab">
    <div class="fila" style="gap:8px;margin-bottom:10px">
      <span class="chip ch-ok">tu ritmo de resonancia</span>
      <span class="dim2">${esc(inf.cuando || '')} · ${duracion(inf.dur)}</span>
    </div>
    ${p ? `<div class="cifra c-xl" style="color:${C.pulso}">${n1(p.rpm)}<span class="uni"
      style="font-size:22px">rpm</span></div>
    <div class="rot" style="margin:9px 0 12px">tu frecuencia de resonancia</div>
    <p class="vered">Tu corazón oscila más a ${n1(p.rpm)} respiraciones por minuto que a
      ningún otro ritmo. Eso son <b>${n1(p.inhala)} s inhalando y ${n1(p.exhala)} s exhalando</b>.</p>`
    : `<p class="vered">No he podido fijar tu ritmo con estos datos.</p>`}
  </div>

  <div class="tar">
    <div class="rot" style="margin-bottom:10px">La curva</div>
    ${gResonancia(res)}
    <p class="dim2" style="margin:8px 0 0">Cada punto es un ritmo medido. La joroba es la
      resonancia: ahí tu barorreflejo y tu respiración empujan a la vez.</p>
  </div>

  <div class="tar">
    <div class="fila entre" style="margin-bottom:10px">
      <span class="rot">Qué tan de fiar es</span>
      <span class="chip ch-${cc[0]}">${cc[1]}</span>
    </div>
    ${res.aviso ? `<p class="dim2" style="margin:0 0 10px">${esc(res.aviso)}</p>` : ''}
    <table class="tabla">
      <tr><td>Ritmos con datos</td><td>${res.curva.length}</td></tr>
      <tr><td>Minutos útiles</td><td>${n1(res.minutosUtiles)}</td></tr>
      ${p ? `<tr><td>Cuánto sobresale el pico</td><td>${n0(p.prominencia * 100)} %</td></tr>
      <tr><td>Forma de joroba</td><td>${n0(p.forma * 100)} %</td></tr>` : ''}
    </table>
  </div>

  ${p && p.confianza !== 'baja' ? `<div class="tar" style="background:none;border-style:dashed">
    <div class="rot" style="margin-bottom:8px">Guardado</div>
    <p class="dim2" style="margin:0">Tu sesión de coherencia usará <b>${n1(p.rpm)} rpm</b>
      a partir de ahora, en vez de los 5,5 de serie. Puedes volver a medirlo cuando quieras:
      cambia con la forma física y con los años.</p>
  </div>` : ''}
</div>`;
  }

  /* ================================ 7 · QUÉ ES LA JOROBA (explicador) =====
     La curva de resonancia es abstracta. Lo que NO es abstracto es ver el
     pulso oscilando poco, más, y mucho más — con los mismos latidos de la
     misma persona. Esta pieza enseña eso: tres tramos reales a tres ritmos,
     a la MISMA escala vertical, y luego los tres puntos puestos en la curva. */

  function tramoIBI(inf, t0, t1) {
    const t = [], v = [];
    for (let i = 0; i < inf.ibi.t.length; i++)
      if (inf.ibi.t[i] >= t0 && inf.ibi.t[i] <= t1) { t.push(inf.ibi.t[i]); v.push(inf.ibi.ibi[i] * 1000); }
    return { t: t, v: v };
  }

  /* Una tira: el tacograma de un tramo, con su oscilación marcada. */
  function gTira(inf, p, escala, color) {
    const DUR = 60;
    const t0 = Math.max(0, p.t - DUR / 2), t1 = t0 + DUR;
    const d = tramoIBI(inf, t0, t1);
    if (d.v.length < 8) return '';
    const W = 560, H = 92, m = { l: 8, r: 96, t: 10, b: 10 };
    const e = ejes(W, H, m);
    const cen = d.v.reduce((s, x) => s + x, 0) / d.v.length;
    const lo = cen - escala / 2, hi = cen + escala / 2;
    const pts = d.t.map((tt, i) => [e.x(tt, t0, t1), e.y(d.v[i], lo, hi)]);

    // la banda que ocupa la oscilación, para verla como un grosor
    const yA = e.y(cen + p.rsa / 2, lo, hi), yB = e.y(cen - p.rsa / 2, lo, hi);
    return `<svg viewBox="0 0 ${W} ${H}" class="gr" role="img"
      aria-label="oscilación del pulso respirando a ${n1(p.rpm)} respiraciones por minuto">
      <rect x="${m.l}" y="${yA.toFixed(1)}" width="${(W - m.l - m.r).toFixed(1)}"
        height="${(yB - yA).toFixed(1)}" fill="${color}" opacity=".13"/>
      <line x1="${m.l}" y1="${e.y(cen, lo, hi).toFixed(1)}" x2="${(W - m.r).toFixed(1)}"
        y2="${e.y(cen, lo, hi).toFixed(1)}" stroke="${C.linea}" stroke-dasharray="3 4"/>
      <path d="${ruta(pts)}" fill="none" stroke="${color}" stroke-width="2"
        stroke-linejoin="round" stroke-linecap="round"/>
      <line x1="${(W - m.r + 14).toFixed(1)}" y1="${yA.toFixed(1)}"
        x2="${(W - m.r + 14).toFixed(1)}" y2="${yB.toFixed(1)}" stroke="${color}" stroke-width="1.6"/>
      <path d="M${(W-m.r+10).toFixed(1)},${(yA+5).toFixed(1)} L${(W-m.r+14).toFixed(1)},${yA.toFixed(1)}
        L${(W-m.r+18).toFixed(1)},${(yA+5).toFixed(1)}" fill="none" stroke="${color}" stroke-width="1.6"/>
      <path d="M${(W-m.r+10).toFixed(1)},${(yB-5).toFixed(1)} L${(W-m.r+14).toFixed(1)},${yB.toFixed(1)}
        L${(W-m.r+18).toFixed(1)},${(yB-5).toFixed(1)}" fill="none" stroke="${color}" stroke-width="1.6"/>
      <text x="${(W - m.r + 24).toFixed(1)}" y="${((yA + yB) / 2 + 4).toFixed(1)}" fill="${color}"
        font-size="15" font-weight="600">${n0(p.rsa)} ms</text></svg>`;
  }

  /* La curva pequeña con los tres puntos y, detrás, la joroba que saldría de
     una sesión guiada bien hecha. Comparar las dos es lo que hace entender. */
  function gJorobaCurva(puntos, res) {
    const W = 560, H = 220, m = { l: 46, r: 18, t: 30, b: 44 };
    const e = ejes(W, H, m);
    const X0 = 3.2, X1 = 8.0;
    const Y1 = Math.max(230, Math.max.apply(null, puntos.map(p => p.rsa)) * 1.35);

    // joroba de referencia: campana centrada en el pico estimado
    const pico = res && res.pico ? res.pico.rpm : 5.2;
    const alto = Math.max.apply(null, puntos.map(p => p.rsa)) * 1.12;
    const ideal = [];
    for (let r = X0; r <= X1; r += 0.1) {
      const y = alto * Math.exp(-Math.pow((r - pico) / 0.95, 2)) + 55;
      ideal.push([e.x(r, X0, X1), e.y(y, 0, Y1)]);
    }

    let rejilla = '', etq = '';
    for (let k = 0; k <= 3; k++) {
      const v = Y1 * k / 3, y = e.y(v, 0, Y1);
      rejilla += `<line x1="${m.l}" y1="${y.toFixed(1)}" x2="${W - m.r}" y2="${y.toFixed(1)}"
        stroke="${C.linea}" stroke-width=".7"/>`;
      etq += `<text x="${m.l - 7}" y="${(y + 3.5).toFixed(1)}" fill="${C.tx3}" font-size="9"
        text-anchor="end">${Math.round(v)}</text>`;
    }
    let ejeX = '';
    for (let r = 4; r <= 8; r++)
      ejeX += `<text x="${e.x(r, X0, X1).toFixed(1)}" y="${H - 22}" fill="${C.tx3}" font-size="9.5"
        text-anchor="middle">${r}</text>`;

    let marcas = '';
    const orden = puntos.slice().sort((a, b) => a.rpm - b.rpm);
    const pts = orden.map(p => [e.x(p.rpm, X0, X1), e.y(p.rsa, 0, Y1)]);
    orden.forEach((p, i) => {
      marcas += `<circle cx="${pts[i][0].toFixed(1)}" cy="${pts[i][1].toFixed(1)}" r="6"
        fill="${p.color}" stroke="${C.sup}" stroke-width="2"/>
        <text x="${pts[i][0].toFixed(1)}" y="${(pts[i][1] - 13).toFixed(1)}" fill="${p.color}"
        font-size="11" font-weight="600" text-anchor="middle">${n0(p.rsa)}</text>`;
    });

    /* La zona que NUNCA se midió. Es la mitad del mensaje: la cima puede estar
       ahí dentro y no hay forma de saberlo sin bajar a esos ritmos. */
    const rMin = Math.min.apply(null, puntos.map(p => p.rpm));
    const xSin = e.x(rMin, X0, X1);
    const sinMedir = `<rect x="${m.l}" y="${m.t}" width="${(xSin - m.l).toFixed(1)}"
      height="${H - m.t - m.b}" fill="${C.mal}" opacity=".07"/>
      <line x1="${xSin.toFixed(1)}" y1="${m.t}" x2="${xSin.toFixed(1)}" y2="${H - m.b}"
      stroke="${C.mal}" stroke-width="1" stroke-dasharray="2 3" opacity=".6"/>
      <text x="${((m.l + xSin) / 2).toFixed(1)}" y="${(H - m.b - 8).toFixed(1)}" fill="${C.mal}"
      font-size="9.5" text-anchor="middle" opacity=".85">no lo probaste</text>`;

    return `<svg viewBox="0 0 ${W} ${H}" class="gr" role="img"
      aria-label="la joroba de resonancia: tus tres puntos frente a la curva completa">
      ${rejilla}${sinMedir}
      <path d="${ruta(ideal)}" fill="none" stroke="${C.tx3}" stroke-width="1.6"
        stroke-dasharray="5 5" opacity=".7"/>
      <text x="${(e.x(pico, X0, X1) + 10).toFixed(1)}" y="${(m.t + 30).toFixed(1)}"
        fill="${C.tx3}" font-size="9.5">la forma que buscamos</text>
      <path d="${ruta(pts)}" fill="none" stroke="${C.pulso}" stroke-width="2.4"/>
      ${marcas}${etq}${ejeX}
      <text x="${m.l - 40}" y="12" fill="${C.tx3}" font-size="9"
        text-anchor="start">cuánto oscila tu pulso (ms)</text>
      <text x="${W / 2}" y="${H - 6}" fill="${C.tx3}" font-size="9.5" text-anchor="middle">
        respiraciones por minuto</text></svg>`;
  }

  /* La pieza completa. */
  function explicarJoroba(inf, res) {
    const cands = inf.serie.filter(p => isFinite(p.rpm) && isFinite(p.rsa) &&
                                        p.cobertura > 0.7 && p.rpm > 3.5 && p.rpm < 9);
    if (cands.length < 3) return '<p class="dim2">No hay tramos suficientes.</p>';
    const cerca = r => cands.reduce((b, p) =>
      (!b || Math.abs(p.rpm - r) < Math.abs(b.rpm - r)) ? p : b, null);
    const cols = [C.tx2, C.aire, C.pulso];
    const sel = [cerca(7.3), cerca(5.5), cerca(4.5)]
      .filter((p, i, a) => a.indexOf(p) === i)
      .map((p, i) => Object.assign({}, p, { color: cols[i] || C.pulso }));
    if (sel.length < 3) return '<p class="dim2">No hay tramos suficientes.</p>';

    // misma escala vertical en las tres tiras: si no, la comparación miente
    const escala = Math.max.apply(null, sel.map(p => p.rsa)) * 2.6;
    const dice = ['se mueve poco', 'se mueve más', 'se mueve mucho más'];

    return `
      <div class="tar">
        <div class="rot" style="margin-bottom:4px">Tus latidos, a tres ritmos distintos</div>
        <p class="dim2" style="margin:0 0 14px">Un minuto real de tu sesión en cada caso.
          <b style="color:var(--tx2)">Las tres tiras están a la misma escala</b>, así que la
          comparación es honesta: lo que cambia es tu corazón, no el dibujo.</p>
        ${sel.map((p, i) => `
          <div style="margin-bottom:16px">
            <div class="fila entre" style="margin-bottom:2px">
              <span style="font-size:13.5px;color:${p.color};font-weight:600">
                respirando a ${n1(p.rpm)} rpm</span>
              <span class="dim2">${dice[i]}</span>
            </div>
            ${gTira(inf, p, escala, p.color)}
          </div>`).join('')}
        <p class="dim2" style="margin:0">Cada línea es el tiempo entre un latido y el siguiente.
          Cuando respiras lento, ese tiempo sube y baja mucho más con cada respiración: el
          corazón acelera al inhalar y frena al exhalar, y la diferencia se hace grande.</p>
      </div>

      <div class="tar">
        <div class="rot" style="margin-bottom:4px">Y ahora esos tres números, en una curva</div>
        <p class="dim2" style="margin:0 0 12px">Cada punto es una de las tiras de arriba.</p>
        ${gJorobaCurva(sel, res)}
        <p class="dim2" style="margin:10px 0 0">Tu línea verde va subiendo hacia la izquierda:
          cuanto más lento respiras, más oscila. <b style="color:var(--tx2)">Pero no llega a
          bajar otra vez</b>, y por eso no se ve joroba — no probaste ritmos suficientemente
          lentos. La línea gris es la forma que buscamos: sube, hace cima y baja. Esa cima
          es tu ritmo.</p>
      </div>`;
  }

  /* ============================================ 8 · HUMMING / EXHALACIONES ==
     Aquí el sensor protagonista es EL CINTURÓN. El dedo dice qué hace el
     corazón; el cinturón dice cuánto aire te queda, y sin eso no hay práctica
     de exhalación larga: no se puede entrenar lo que no se mide. */

  /* La escalera: cada zumbido, una barra. Se ve crecer la marca. */
  function gEscalera(ex, objetivo) {
    const L = ex.lista;
    if (!L.length) return '';
    const W = 560, alto = 22, H = L.length * alto + 46, m = { l: 40, r: 66, t: 14, b: 24 };
    const maxD = Math.max(objetivo || 0, ex.masLarga) * 1.12;
    const e = ejes(W, H, m);
    let barras = '';
    L.forEach((h, i) => {
      const y = m.t + i * alto;
      const x1 = e.x(h.dur, 0, maxD);
      // el color dice lo parejo que vació: verde parejo, ámbar a trompicones
      const col = h.constancia > 65 ? C.pulso : h.constancia > 40 ? C.rito : C.tx3;
      barras += `<text x="${m.l - 7}" y="${(y + 13).toFixed(1)}" fill="${C.tx3}" font-size="9.5"
        text-anchor="end">${i + 1}</text>
        <rect x="${m.l}" y="${(y + 3).toFixed(1)}" width="${(x1 - m.l).toFixed(1)}"
        height="${alto - 8}" rx="3" fill="${col}" opacity=".85"/>
        <text x="${(x1 + 7).toFixed(1)}" y="${(y + 13).toFixed(1)}" fill="${col}"
        font-size="11" font-weight="600">${n1(h.dur)} s</text>`;
    });
    let meta = '';
    if (objetivo) {
      const x = e.x(objetivo, 0, maxD);
      meta = `<line x1="${x.toFixed(1)}" y1="${m.t - 4}" x2="${x.toFixed(1)}"
        y2="${(H - m.b + 2).toFixed(1)}" stroke="${C.aire}" stroke-width="1.5"
        stroke-dasharray="4 3"/>
        <text x="${x.toFixed(1)}" y="${(H - m.b + 15).toFixed(1)}" fill="${C.aire}"
        font-size="9.5" text-anchor="middle">tu récord ${n1(objetivo)} s</text>`;
    }
    return `<svg viewBox="0 0 ${W} ${H}" class="gr" role="img"
      aria-label="duración de cada zumbido">${meta}${barras}</svg>`;
  }

  /* El perfil del vaciado: todas las exhalaciones superpuestas, normalizadas.
     Una exhalación entrenada baja en línea recta; una improvisada suelta el
     aire de golpe y luego se arrastra. Se ve de un vistazo. */
  function gPerfiles(ex) {
    const L = ex.lista.filter(h => h.perfil && h.perfil.length > 6);
    if (L.length < 2) return '';
    const W = 560, H = 190, m = { l: 44, r: 16, t: 14, b: 34 };
    const e = ejes(W, H, m);
    let curvas = '';
    L.forEach(h => {
      const pts = h.perfil.map((v, i) =>
        [e.x(i / (h.perfil.length - 1), 0, 1), e.y(v, 0, 1)]);
      const col = h.constancia > 65 ? C.pulso : h.constancia > 40 ? C.rito : C.tx3;
      curvas += `<path d="${ruta(pts)}" fill="none" stroke="${col}" stroke-width="1.5"
        opacity=".55"/>`;
    });
    const ideal = `<line x1="${e.x(0,0,1).toFixed(1)}" y1="${e.y(1,0,1).toFixed(1)}"
      x2="${e.x(1,0,1).toFixed(1)}" y2="${e.y(0,0,1).toFixed(1)}" stroke="${C.aire}"
      stroke-width="2" stroke-dasharray="5 4"/>`;
    return `<svg viewBox="0 0 ${W} ${H}" class="gr" role="img"
      aria-label="forma del vaciado de cada exhalación">
      <line x1="${m.l}" y1="${e.y(1,0,1).toFixed(1)}" x2="${W-m.r}" y2="${e.y(1,0,1).toFixed(1)}"
        stroke="${C.linea}"/>
      <line x1="${m.l}" y1="${e.y(0,0,1).toFixed(1)}" x2="${W-m.r}" y2="${e.y(0,0,1).toFixed(1)}"
        stroke="${C.linea}"/>
      ${ideal}${curvas}
      <text x="${m.l - 7}" y="${(e.y(1,0,1)+4).toFixed(1)}" fill="${C.tx3}" font-size="9"
        text-anchor="end">lleno</text>
      <text x="${m.l - 7}" y="${(e.y(0,0,1)+4).toFixed(1)}" fill="${C.tx3}" font-size="9"
        text-anchor="end">vacío</text>
      <text x="${m.l}" y="${H - 8}" fill="${C.tx3}" font-size="9">empiezas</text>
      <text x="${W - m.r}" y="${H - 8}" fill="${C.tx3}" font-size="9" text-anchor="end">
        se acaba el aire</text>
      <text x="${(W/2).toFixed(0)}" y="${H - 8}" fill="${C.aire}" font-size="9"
        text-anchor="middle">la raya azul es el vaciado perfecto</text></svg>`;
  }

  /* Qué le hace cada zumbido a tu pulso. */
  function gPulsoZumbido(ex) {
    const L = ex.lista.filter(h => isFinite(h.hrIni) && isFinite(h.hrFin));
    if (L.length < 3) return '';
    const W = 560, H = 150, m = { l: 44, r: 16, t: 16, b: 30 };
    const e = ejes(W, H, m);
    const todos = L.flatMap(h => [h.hrIni, h.hrFin]);
    const lo = Math.min.apply(null, todos) - 3, hi = Math.max.apply(null, todos) + 3;
    const anchoCol = (W - m.l - m.r) / L.length;
    let piezas = '';
    L.forEach((h, i) => {
      const x = m.l + anchoCol * (i + 0.5);
      const yA = e.y(h.hrIni, lo, hi), yB = e.y(h.hrFin, lo, hi);
      const baja = h.hrFin < h.hrIni;
      const col = baja ? C.pulso : C.rito;
      piezas += `<line x1="${x.toFixed(1)}" y1="${yA.toFixed(1)}" x2="${x.toFixed(1)}"
        y2="${yB.toFixed(1)}" stroke="${col}" stroke-width="2.4"/>
        <circle cx="${x.toFixed(1)}" cy="${yA.toFixed(1)}" r="3" fill="${C.tx3}"/>
        <circle cx="${x.toFixed(1)}" cy="${yB.toFixed(1)}" r="4.5" fill="${col}"/>`;
    });
    let etq = '';
    for (let k = 0; k <= 2; k++) {
      const v = lo + (hi - lo) * k / 2, y = e.y(v, lo, hi);
      etq += `<line x1="${m.l}" y1="${y.toFixed(1)}" x2="${W-m.r}" y2="${y.toFixed(1)}"
        stroke="${C.linea}" stroke-width=".7"/>
        <text x="${m.l - 7}" y="${(y+3.5).toFixed(1)}" fill="${C.tx3}" font-size="9"
        text-anchor="end">${Math.round(v)}</text>`;
    }
    return `<svg viewBox="0 0 ${W} ${H}" class="gr" role="img"
      aria-label="pulso al empezar y al terminar cada zumbido">${etq}${piezas}
      <text x="${m.l}" y="11" fill="${C.tx3}" font-size="9">lpm</text>
      <text x="${W-m.r}" y="${H-8}" fill="${C.tx3}" font-size="9" text-anchor="end">
        punto pequeño: al empezar · grande: al acabar</text></svg>`;
  }

  function renderHumming(inf, ex, record) {
    if (!ex.n) return `<div class="tar"><p class="dim2">No detecté exhalaciones largas.
      ¿Estaba puesto el cinturón?</p></div>`;
    const nuevoRecord = record && ex.masLarga > record;
    const bajan = ex.lista.filter(h => isFinite(h.hrIni) && isFinite(h.hrFin) && h.hrFin < h.hrIni).length;
    const conHr = ex.lista.filter(h => isFinite(h.hrIni) && isFinite(h.hrFin)).length;
    return `
<div class="inf">
  <div class="inf-cab">
    <div class="fila" style="gap:8px;margin-bottom:10px">
      <span class="chip ch-ok">zumbido largo</span>
      <span class="dim2">${esc(inf.cuando || '')} · ${duracion(inf.dur)}</span>
    </div>
    <div class="cifra c-xl" style="color:${C.pulso}">${n1(ex.masLarga)}<span class="uni"
      style="font-size:22px">s</span></div>
    <div class="rot" style="margin:9px 0 12px">tu exhalación más larga</div>
    <p class="vered">${ex.n} exhalaciones sostenidas${nuevoRecord
      ? `. <b>Récord nuevo</b>: has batido tus ${n1(record)} s anteriores.`
      : record ? `. Tu récord sigue en ${n1(record)} s.` : '.'}
      ${conHr ? `El pulso bajó dentro de ${bajan} de ${conHr}.` : ''}</p>
  </div>

  <div class="tar">
    <div class="rot" style="margin-bottom:10px">La escalera</div>
    ${gEscalera(ex, record || ex.masLarga)}
    <p class="dim2" style="margin:8px 0 0">Cada barra, un zumbido. Verde: vaciaste parejo.
      Ámbar: a trompicones.</p>
  </div>

  <div class="tar">
    <div class="rot" style="margin-bottom:10px">Cómo vaciaste</div>
    ${gPerfiles(ex)}
    <p class="dim2" style="margin:8px 0 0">Esto lo mide el cinturón, no el dedo. Cuanto más
      pegadas van tus curvas a la raya azul, más control tienes: significa soltar el aire a
      ritmo constante en vez de gastarlo al principio.</p>
  </div>

  ${gPulsoZumbido(ex) ? `<div class="tar">
    <div class="rot" style="margin-bottom:10px">Qué hizo tu corazón</div>
    ${gPulsoZumbido(ex)}
    <p class="dim2" style="margin:8px 0 0">Exhalar largo frena el corazón: la línea verde baja.
      Si sube (ámbar), fue esfuerzo, no relajación — señal de que apuraste de más.</p>
  </div>` : ''}

  <div class="tar">
    <div class="rot" style="margin-bottom:10px">Los números</div>
    <table class="tabla">
      <tr><td>Exhalaciones</td><td>${ex.n}</td></tr>
      <tr><td>La más larga</td><td>${n1(ex.masLarga)} s</td></tr>
      <tr><td>Mediana</td><td>${n1(ex.mediana)} s</td></tr>
      <tr><td>Constancia del vaciado</td><td>${n0(ex.constanciaMedia)} %</td></tr>
      <tr><td>Tiempo total exhalando</td><td>${n0(ex.totalSeg)} s</td></tr>
      <tr><td>Pulso medio</td><td>${n1(inf.resumen.hr)} lpm</td></tr>
    </table>
  </div>
</div>`;
  }

  /* ================================================== redacción =========== */
  /* El veredicto en una frase. Es lo primero que se lee y lo único que
     mucha gente leerá: tiene que decir algo verdadero y concreto. */
  function veredicto(inf) {
    const r = inf.resumen;
    const res = inf.eventos.find(e => e.tipo === 'resonancia');
    const rets = inf.eventos.filter(e => e.tipo === 'retencion');
    const p = [];
    if (inf.tipo === 'coherencia' || inf.objetivoRpm) {
      if (res) p.push('Entraste en resonancia y te mantuviste ahí un buen rato.');
      else if (r.coherencia > 45) p.push('Sostuviste el ritmo con buena regularidad.');
      else if (rets.length > 4) p.push('Sesión de retenciones, no de ritmo sostenido: el pulso siguió tus apneas más que un compás.');
      else p.push('Ritmo irregular esta vez — el pulso no llegó a asentarse en una oscilación limpia.');
      if (isFinite(r.adherencia))
        p.push(`Respiraste a ${n1(r.rpm)} rpm de mediana` +
               (inf.objetivoRpm ? ` frente a las ${n1(inf.objetivoRpm)} que marcaba la guía.` : '.'));
    } else {
      p.push(`Tu pulso se mantuvo en ${n0(r.hr)} lpm de media` +
             (isFinite(r.hrMin) ? `, con un mínimo de ${n0(r.hrMin)}.` : '.'));
    }
    if (rets.length) {
      const largas = rets.filter(v => v.dur >= 8);
      if (largas.length) {
        const max = Math.max.apply(null, largas.map(v => v.dur));
        p.push(`${rets.length} retenciones detectadas, la más larga de ${n0(max)} segundos.`);
      }
    }
    return p.join(' ');
  }

  function titular(inf) {
    const r = inf.resumen;
    if (inf.tipo === 'coherencia' || inf.objetivoRpm)
      return { v: n0(r.coherencia), u: '%', et: 'coherencia media', col: C.pulso };
    if (inf.tipo === 'hrv')
      return { v: n0(r.rmssd), u: 'ms', et: 'RMSSD', col: C.pulso };
    return { v: n0(r.hr), u: 'lpm', et: 'pulso medio', col: C.pulso };
  }

  /* ==================================================== ensamblado ======== */
  function render(inf) {
    const r = inf.resumen, t = titular(inf);
    const evs = inf.eventos.filter(e => e.tipo !== 'retencion' || e.dur >= 8);
    const nRet = inf.eventos.filter(e => e.tipo === 'retencion').length;

    const filas = [];
    if (isFinite(r.adherencia)) filas.push(['Adherencia al ritmo', n0(r.adherencia) + ' %']);
    filas.push(['Respiración', n1(r.rpm) + ' rpm']);
    filas.push(['Oscilación RSA', n0(r.rsa) + ' ms']);
    filas.push(['Pulso medio', n1(r.hr) + ' lpm']);
    filas.push(['RMSSD', n0(r.rmssd) + ' ms']);
    filas.push(['SDNN', n0(r.sdnn) + ' ms']);
    filas.push(['pNN50', n0(r.pnn50) + ' %']);
    if (isFinite(inf.global.lfhf)) filas.push(['LF/HF', n1(inf.global.lfhf)]);
    if (nRet) filas.push(['Retenciones', nRet]);

    const cob = r.cobertura * 100;
    const cal = cob > 85 ? ['buena', 'ok'] : cob > 70 ? ['aceptable', 'ojo'] : ['pobre', 'mal'];

    return `
<div class="inf">
  <div class="inf-cab">
    <div class="fila" style="gap:8px;margin-bottom:10px">
      <span class="chip ch-ok">${esc(inf.etiqueta || inf.tipo)}</span>
      <span class="dim2">${esc(inf.cuando)} · ${duracion(inf.dur)}</span>
    </div>
    <div class="cifra c-xl" style="color:${t.col}">${t.v}<span class="uni"
      style="font-size:22px">${t.u}</span></div>
    <div class="rot" style="margin:9px 0 12px">${t.et}</div>
    <p class="vered">${esc(veredicto(inf))}</p>
  </div>

  <div class="tar">
    <div class="rot" style="margin-bottom:10px">Cómo fue</div>
    ${gTiempo(inf)}
    <p class="dim2" style="margin:8px 0 0">Pulso minuto a minuto. Las bandas azules son
      retenciones detectadas automáticamente.</p>
  </div>

  ${gAcople(inf) ? `<div class="tar">
    <div class="rot" style="margin-bottom:10px">Tu corazón siguiendo tu respiración</div>
    ${gAcople(inf)}
    <p class="dim2" style="margin:8px 0 0">Las dos curvas suben y bajan juntas: eso es la arritmia
      sinusal respiratoria, y es la señal de que la respiración está gobernando al corazón.</p>
  </div>` : ''}

  <div class="tar">
    <div class="rot" style="margin-bottom:10px">Dónde está tu energía</div>
    ${gEspectro(inf)}
    <p class="dim2" style="margin:8px 0 0">Cuanto más estrecha y alta la punta, más regular fue tu
      respiración. Una punta ancha o varias puntas significan ritmo cambiante.</p>
  </div>

  ${gCoherencia(inf) ? `<div class="tar">
    <div class="rot" style="margin-bottom:10px">Coherencia a lo largo de la sesión</div>
    ${gCoherencia(inf)}
    <p class="dim2" style="margin:8px 0 0">Cada barra son 2 minutos. Verde intenso: estabas
      en resonancia.</p>
  </div>` : ''}

  ${evs.length ? `<div class="tar">
    <div class="rot" style="margin-bottom:4px">Momentos</div>
    ${evs.slice(0, 8).map(e => `<div class="momento">
      <span class="t">${mmss(e.t)}</span><p>${e.texto}</p></div>`).join('')}
    ${evs.length > 8 ? `<p class="dim2" style="margin:9px 0 0">y ${evs.length - 8} momentos
      más en el detalle completo.</p>` : ''}
  </div>` : ''}

  <div class="tar">
    <div class="rot" style="margin-bottom:10px">Los números</div>
    <table class="tabla">${filas.map(f =>
      `<tr><td>${f[0]}</td><td>${f[1]}</td></tr>`).join('')}</table>
  </div>

  <div class="tar">
    <div class="rot" style="margin-bottom:10px">Cada latido frente al siguiente</div>
    <div style="display:flex;justify-content:center">${gPoincare(inf)}</div>
    <p class="dim2" style="margin:8px 0 0">Una nube redonda y ancha significa variabilidad sana.
      Una nube alargada y fina, un corazón rígido.</p>
  </div>

  <div class="tar" style="background:none;border-style:dashed">
    <div class="fila entre">
      <span class="rot">Calidad del dato</span>
      <span class="chip ch-${cal[1]}">${cal[0]}</span>
    </div>
    <p class="dim2" style="margin:8px 0 0">${inf.latidos} latidos detectados ·
      ${n0(cob)} % válidos tras descartar artefactos · analizado en ${inf.ms} ms
      en el propio teléfono.</p>
  </div>
</div>`;
  }

  return { render, renderResonancia, renderHumming, explicarJoroba, gTiempo, gAcople,
           gEspectro, gCoherencia, gPoincare, gResonancia, gEscalera, gPerfiles,
           gPulsoZumbido, veredicto, duracion };
})();
