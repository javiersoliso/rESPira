/* ============================================================================
 *  rESPira · MOTOR DE ANÁLISIS            (JavaScript puro, sin dependencias)
 * ============================================================================
 *  Es el puerto del análisis que corrí en Python sobre la sesión nocturna:
 *  mismo filtro Butterworth, mismo detector de latidos, mismas métricas.
 *  Corre en el teléfono, sin internet, sobre la señal cruda que el ESP32 ya
 *  manda por WebSocket.
 *
 *  12 minutos a 100 Hz son 72.000 muestras: el análisis completo tarda
 *  décimas de segundo. Una noche entera, unos segundos.
 *
 *  Uso:
 *      const inf = Motor.analizar({ir, fs, pot, fsPot, tipo:'coherencia',
 *                                  objetivoRpm:5.5});
 * ========================================================================== */
window.Motor = (function () {
  'use strict';

  /* ---------------------------------------------------------------- datos --
     Los lotes vienen delta-codificados en varint zigzag: un delta típico
     ocupa un byte, así que la señal pesa 5 veces menos que en crudo. */
  function desvarint(b64) {
    const bin = atob(b64);
    const out = [];
    let prev = 0, i = 0;
    while (i < bin.length) {
      let z = 0, s = 1, b;
      do {
        b = bin.charCodeAt(i++);
        z += (b & 0x7f) * s;
        s *= 128;
      } while (b & 0x80);
      // deszigzag sin operadores de bits: los valores pasan de 32 bits
      prev += (z % 2) ? -((z + 1) / 2) : z / 2;
      out.push(prev);
    }
    return Float64Array.from(out);
  }

  /* -------------------------------------------------------------- filtros --
     Secciones de segundo orden tabuladas (calculadas con scipy). Tabular en
     vez de calcular evita depender de que la transformada bilineal esté bien
     escrita, que es justo donde se cuelan los errores silenciosos. */
  const SOS_PPG = {
    50: [[4.7505236110e-03, 9.5010472220e-03, 4.7505236110e-03, -1.5748378909e+00, 7.2532981044e-01],
         [1, 0, -1, -1.6561668662e+00, 6.7959929822e-01],
         [1, -2, 1, -1.9458353179e+00, 9.5005104647e-01]],
    100: [[6.9934964990e-04, 1.3986992998e-03, 6.9934964990e-04, -1.8094297309e+00, 8.5011632509e-01],
          [1, 0, -1, -1.8209447783e+00, 8.2727194597e-01],
          [1, -2, 1, -1.9737050150e+00, 9.7477324081e-01]],
    106.7: [[5.8195858730e-04, 1.1639171746e-03, 5.8195858730e-04, -1.8228542573e+00, 8.5877101541e-01],
            [1, 0, -1, -1.8317030594e+00, 8.3728941163e-01],
            [1, -2, 1, -1.9754019114e+00, 9.7634097304e-01]]
  };
  const SOS_RSA = [[8.2096098303e-02, 1.6419219661e-01, 8.2096098303e-02, -1.0525023722e+00, 4.1215378330e-01],
                   [1, -2, 1, -1.8922650098e+00, 8.9914662783e-01]];
  const SOS_POT = [[3.6574835844e-02, 7.3149671688e-02, 3.6574835844e-02, -1.3908952814e+00, 5.3719462480e-01]];

  function sosUnaVez(sos, x) {
    const y = Float64Array.from(x);
    for (let k = 0; k < sos.length; k++) {
      const [b0, b1, b2, a1, a2] = sos[k];
      let z1 = 0, z2 = 0;
      for (let i = 0; i < y.length; i++) {
        const xi = y[i];
        const yi = b0 * xi + z1;
        z1 = b1 * xi - a1 * yi + z2;
        z2 = b2 * xi - a2 * yi;
        y[i] = yi;
      }
    }
    return y;
  }

  /* Filtrado de fase cero: adelante y atrás. Sin esto los picos se desplazan
     y los intervalos entre latidos salen sesgados. */
  function filtfilt(sos, x) {
    const n = x.length, pad = Math.min(3 * 6, n - 1);
    if (n < 12) return Float64Array.from(x);
    const ext = new Float64Array(n + 2 * pad);
    for (let i = 0; i < pad; i++) ext[i] = 2 * x[0] - x[pad - i];          // reflejo
    ext.set(x, pad);
    for (let i = 0; i < pad; i++) ext[n + pad + i] = 2 * x[n - 1] - x[n - 2 - i];
    let y = sosUnaVez(sos, ext);
    y.reverse();
    y = sosUnaVez(sos, y);
    y.reverse();
    return y.slice(pad, pad + n);
  }

  /* ---------------------------------------------------------- estadística -- */
  const mediana = a => {
    if (!a.length) return NaN;
    const t = Float64Array.from(a).sort();
    const m = t.length >> 1;
    return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2;
  };
  const media = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN;
  const desv = a => {
    if (a.length < 2) return NaN;
    const m = media(a);
    return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / a.length);
  };
  const percentil = (a, p) => {
    if (!a.length) return NaN;
    const t = Float64Array.from(a).sort();
    const i = Math.min(t.length - 1, Math.max(0, Math.round(p * (t.length - 1))));
    return t[i];
  };

  /* --------------------------------------------------- detección de picos --
     El latido es un MÍNIMO de la señal filtrada: en reflectancia el infrarrojo
     baja en sístole. La prominencia se mide contra una escala local (bloques
     de 20 s) para que un tramo de señal pobre no arrastre al resto. */
  function detectarLatidos(ir, fs) {
    const sos = SOS_PPG[fs] || SOS_PPG[100];
    const y = filtfilt(sos, ir);

    const nb = Math.max(1, Math.floor(20 * fs));
    const esc = new Float64Array(y.length);
    for (let b = 0; b < y.length; b += nb) {
      const fin = Math.min(b + nb, y.length);
      const abs = [];
      for (let i = b; i < fin; i++) abs.push(Math.abs(y[i]));
      const e = mediana(abs) || 1e-6;
      for (let i = b; i < fin; i++) esc[i] = e;
    }
    const yn = new Float64Array(y.length);
    for (let i = 0; i < y.length; i++) yn[i] = -y[i] / esc[i];   // picos hacia arriba

    const dist = Math.round(0.33 * fs), PROM = 1.6, vent = Math.round(3 * fs);
    const cand = [];
    for (let i = 1; i < yn.length - 1; i++) {
      if (yn[i] >= yn[i - 1] && yn[i] > yn[i + 1]) {
        // prominencia: cuánto sobresale sobre el valle más alto a cada lado
        let iz = yn[i], j = i;
        while (j > 0 && j > i - vent && yn[j] <= yn[i]) { if (yn[j] < iz) iz = yn[j]; j--; }
        let de = yn[i], k = i;
        while (k < yn.length - 1 && k < i + vent && yn[k] <= yn[i]) { if (yn[k] < de) de = yn[k]; k++; }
        const prom = yn[i] - Math.max(iz, de);
        if (prom >= PROM) cand.push({ i: i, v: yn[i], prom: prom });
      }
    }
    // separación mínima: gana el más prominente
    cand.sort((a, b) => b.prom - a.prom);
    const tomado = new Uint8Array(yn.length);
    const picos = [];
    for (const c of cand) {
      let libre = true;
      for (let d = Math.max(0, c.i - dist); d < Math.min(yn.length, c.i + dist); d++)
        if (tomado[d]) { libre = false; break; }
      if (!libre) continue;
      tomado[c.i] = 1;
      // interpolación parabólica: el pico real cae entre muestras
      const a = yn[c.i - 1], b = yn[c.i], cc = yn[c.i + 1];
      const den = a - 2 * b + cc;
      const d = Math.abs(den) > 1e-12 ? 0.5 * (a - cc) / den : 0;
      picos.push((c.i + Math.max(-1, Math.min(1, d))) / fs);
    }
    picos.sort((a, b) => a - b);
    return { t: picos, onda: y, fs: fs };
  }

  /* --------------------------------------------------------- IBIs válidos --
     Se descarta lo fisiológicamente imposible y lo que se sale de la mediana
     local. Para RMSSD y pNN50 solo valen PARES de latidos consecutivos que
     hayan sobrevivido los dos: si no, la diferencia salta un latido y el
     número sale inflado. */
  function intervalos(picos) {
    const ibi = [], t = [];
    for (let i = 1; i < picos.length; i++) { ibi.push(picos[i] - picos[i - 1]); t.push(picos[i]); }
    const ok = new Array(ibi.length).fill(false);
    for (let i = 0; i < ibi.length; i++) {
      if (ibi[i] < 0.4 || ibi[i] > 2.2) continue;
      const a = Math.max(0, i - 4), b = Math.min(ibi.length, i + 5);
      const loc = mediana(ibi.slice(a, b));
      ok[i] = Math.abs(ibi[i] - loc) / loc < 0.30;
    }
    const tv = [], iv = [], dif = [], td = [];
    for (let i = 0; i < ibi.length; i++) {
      if (!ok[i]) continue;
      tv.push(t[i]); iv.push(ibi[i]);
      if (i > 0 && ok[i - 1]) { dif.push((ibi[i] - ibi[i - 1]) * 1000); td.push(t[i]); }
    }
    return { t: tv, ibi: iv, dif: dif, tDif: td,
             cobertura: ibi.length ? tv.length / ibi.length : 0 };
  }

  /* ------------------------------------------------------------------ FFT -- */
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len;
      const wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const ur = re[i + k], ui = im[i + k];
          const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
          const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
          re[i + k] = ur + vr; im[i + k] = ui + vi;
          re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
          const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
        }
      }
    }
  }

  /* Densidad espectral por el método de Welch: trozos con ventana de Hann,
     50 % de solape, promediados. Es lo que usa scipy y lo que usé en Python.
     RELLENO DE CEROS (nfft = 4x): respirando a 5 rpm el pico está en 0,08 Hz,
     y sin relleno un tramo de 2 min da bins de 0,016 Hz — más gruesos que la
     banda que hay que medir. Con el relleno se interpola a 0,004 Hz y la
     coherencia deja de depender de dónde caiga el pico dentro del bin. */
  function welch(x, fs, nseg) {
    const n = x.length;
    nseg = Math.min(nseg || 256, 1 << Math.floor(Math.log2(Math.max(16, n))));
    const nfft = nseg * 4;
    const paso = nseg >> 1, nf = nfft / 2 + 1;
    const pw = new Float64Array(nf);
    const han = new Float64Array(nseg);
    let u = 0;
    for (let i = 0; i < nseg; i++) { han[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (nseg - 1)); u += han[i] * han[i]; }
    let bloques = 0;
    for (let s = 0; s + nseg <= n; s += paso) {
      let m = 0;
      for (let i = 0; i < nseg; i++) m += x[s + i];
      m /= nseg;
      const re = new Float64Array(nfft), im = new Float64Array(nfft);
      for (let i = 0; i < nseg; i++) re[i] = (x[s + i] - m) * han[i];
      fft(re, im);
      for (let k = 0; k < nf; k++) {
        const p = (re[k] * re[k] + im[k] * im[k]) / (fs * u);
        pw[k] += (k > 0 && k < nf - 1) ? 2 * p : p;
      }
      bloques++;
    }
    if (!bloques) return { f: new Float64Array(0), p: new Float64Array(0) };
    const f = new Float64Array(nf);
    for (let k = 0; k < nf; k++) { pw[k] /= bloques; f[k] = k * fs / nfft; }
    return { f: f, p: pw };
  }

  const areaBanda = (esp, lo, hi) => {
    let s = 0;
    for (let k = 1; k < esp.f.length; k++)
      if (esp.f[k] >= lo && esp.f[k] < hi) s += esp.p[k] * (esp.f[k] - esp.f[k - 1]);
    return s;
  };

  /* Tacograma a rejilla uniforme de 4 Hz, que es lo que pide el análisis
     espectral de la variabilidad. */
  function tacograma(t, ibi, t0, t1) {
    const paso = 0.25, n = Math.max(8, Math.floor((t1 - t0) / paso));
    const y = new Float64Array(n);
    let j = 0;
    for (let i = 0; i < n; i++) {
      const tt = t0 + i * paso;
      while (j < t.length - 2 && t[j + 1] < tt) j++;
      if (t.length < 2) { y[i] = NaN; continue; }
      const j2 = Math.min(j + 1, t.length - 1);
      const dt = t[j2] - t[j];
      const u = dt > 1e-9 ? Math.max(0, Math.min(1, (tt - t[j]) / dt)) : 0;
      y[i] = (ibi[j] + (ibi[j2] - ibi[j]) * u) * 1000;
    }
    // quitar tendencia: la deriva lenta no es variabilidad latido a latido
    let sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (let i = 0; i < n; i++) { sx += i; sy += y[i]; sxy += i * y[i]; sxx += i * i; }
    const b = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1), a = (sy - b * sx) / n;
    const d = new Float64Array(n);
    for (let i = 0; i < n; i++) d[i] = y[i] - (a + b * i);
    return d;
  }

  /* --------------------------------------------- métricas de una ventana -- */
  function metricas(iv, t, dif, tDif, t0, t1) {
    const sel = [], selD = [];
    for (let i = 0; i < iv.length; i++) if (t[i] >= t0 && t[i] < t1) sel.push(iv[i] * 1000);
    for (let i = 0; i < dif.length; i++) if (tDif[i] >= t0 && tDif[i] < t1) selD.push(dif[i]);
    if (sel.length < 12) return null;
    const m = {
      n: sel.length,
      hr: 60000 / media(sel),
      ibi: media(sel),
      sdnn: desv(sel),
      rmssd: selD.length >= 8 ? Math.sqrt(media(selD.map(d => d * d))) : NaN,
      pnn50: selD.length >= 8 ? 100 * selD.filter(d => Math.abs(d) > 50).length / selD.length : NaN,
      cobertura: sel.reduce((s, v) => s + v, 0) / 1000 / (t1 - t0)
    };
    // espectro sobre el tacograma
    const its = [], tts = [];
    for (let i = 0; i < iv.length; i++) if (t[i] >= t0 && t[i] < t1) { its.push(iv[i]); tts.push(t[i]); }
    if (tts.length >= 12) {
      const tac = tacograma(tts, its, tts[0], tts[tts.length - 1]);
      const esp = welch(tac, 4, 256);
      if (esp.f.length) {
        const lf = areaBanda(esp, 0.04, 0.15), hf = areaBanda(esp, 0.15, 0.40);
        const tot = areaBanda(esp, 0.0033, 0.40);
        m.lf = lf; m.hf = hf; m.lfhf = hf > 0 ? lf / hf : NaN;
        // pico respiratorio: 0,05-0,45 Hz = 3 a 27 rpm
        let mejor = 0, fp = NaN;
        for (let k = 0; k < esp.f.length; k++)
          if (esp.f[k] >= 0.05 && esp.f[k] <= 0.45 && esp.p[k] > mejor) { mejor = esp.p[k]; fp = esp.f[k]; }
        m.rpm = fp * 60;
        /* COHERENCIA: cuánta de la energía total cae en una banda estrecha
           alrededor del pico. Respirar a ritmo fijo concentra el espectro en
           una sola punta; respirar irregular lo dispersa. */
        if (isFinite(fp) && tot > 0) {
          const pPico = areaBanda(esp, Math.max(0.0033, fp - 0.015), fp + 0.015);
          m.coherencia = 100 * pPico / tot;
          /* Amplitud de la oscilación RSA, DE LA BANDA DEL PICO, no de toda la
             señal: para una oscilación de amplitud A la potencia integrada
             vale A²/2, así que el pico a pico son 2·√(2·P). Medirla filtrando
             una banda ancha fija metía dentro las ondas lentas y la inflaba. */
          m.rsa = 2 * Math.sqrt(2 * pPico);
        }
        m.espectro = esp;
      }
    }
    return m;
  }

  /* ------------------------------------------------- eventos de la sesión --
     Lo que convierte un volcado de números en algo que se lee. */
  function eventos(res, opc) {
    const ev = [];
    const { serie, pot, fsPot, objetivoRpm } = res;

    // --- retenciones: el pulmón se queda quieto más de 4 s
    if (pot && pot.length > 40) {
      const suave = filtfilt(SOS_POT, pot);
      const paso = 1 / fsPot;
      let ini = -1;
      for (let i = 1; i < suave.length; i++) {
        const v = Math.abs(suave[i] - suave[i - 1]) / paso;   // %/s
        if (v < 0.8) { if (ini < 0) ini = i; }
        else {
          if (ini >= 0 && (i - ini) * paso >= 4) {
            const t0 = ini * paso, dur = (i - ini) * paso;
            const nivel = media(Array.from(suave.slice(ini, i)));
            const hrA = hrEntre(res, t0, t0 + dur / 3), hrB = hrEntre(res, t0 + 2 * dur / 3, t0 + dur);
            ev.push({ t: t0, tipo: 'retencion', dur: dur,
                      texto: `<b>Retención</b> de ${dur.toFixed(0)} s a pulmón ` +
                             (nivel > 60 ? 'lleno' : nivel < 35 ? 'vacío' : 'medio') +
                             (isFinite(hrA) && isFinite(hrB)
                               ? `. El pulso ${hrB < hrA ? 'bajó' : 'subió'} de ${hrA.toFixed(0)} a ${hrB.toFixed(0)} lpm.`
                               : '.') });
          }
          ini = -1;
        }
      }
    }

    // --- mejor tramo de coherencia
    let mejor = null;
    for (const p of serie) if (isFinite(p.coherencia) && (!mejor || p.coherencia > mejor.coherencia)) mejor = p;
    if (mejor) ev.push({ t: mejor.t, tipo: 'coherencia',
      texto: `<b>Tu mejor tramo</b>: ${mejor.coherencia.toFixed(0)} % de coherencia, ` +
             `con el pulso oscilando ${mejor.rsa.toFixed(0)} ms en cada respiración.` });

    // --- entrada en resonancia: primer punto sostenido por encima del umbral
    const UMB = 55;
    for (let i = 2; i < serie.length; i++) {
      if (serie[i].coherencia > UMB && serie[i - 1].coherencia > UMB && serie[i - 2].coherencia > UMB) {
        let j = i;
        while (j < serie.length && serie[j].coherencia > UMB * 0.8) j++;
        const dur = (serie[Math.min(j, serie.length - 1)].t - serie[i - 2].t);
        if (dur > 60) ev.push({ t: serie[i - 2].t, tipo: 'resonancia',
          texto: `<b>Entraste en resonancia</b> y te mantuviste ${(dur / 60).toFixed(0)} min seguidos.` });
        break;
      }
    }

    // --- desvíos del ritmo objetivo
    if (objetivoRpm) {
      let ini = -1;
      for (let i = 0; i < serie.length; i++) {
        const fuera = isFinite(serie[i].rpm) && Math.abs(serie[i].rpm - objetivoRpm) > objetivoRpm * 0.30;
        if (fuera && ini < 0) ini = i;
        if ((!fuera || i === serie.length - 1) && ini >= 0) {
          const dur = serie[i].t - serie[ini].t;
          if (dur >= 40) ev.push({ t: serie[ini].t, tipo: 'desvio',
            texto: `Te <b>saliste del ritmo</b> unos ${dur.toFixed(0)} s — respiraste a ` +
                   `${serie[ini].rpm.toFixed(1)} rpm en vez de ${objetivoRpm}.` });
          ini = -1;
        }
      }
    }

    // --- tramos de señal pobre
    let ini = -1;
    for (let i = 0; i < serie.length; i++) {
      const malo = serie[i].cobertura < 0.6;
      if (malo && ini < 0) ini = i;
      if ((!malo || i === serie.length - 1) && ini >= 0) {
        const dur = serie[i].t - serie[ini].t;
        if (dur >= 60) ev.push({ t: serie[ini].t, tipo: 'senal',
          texto: `<b>Señal pobre</b> durante ${(dur / 60).toFixed(0)} min — probablemente se movió el dedo.` });
        ini = -1;
      }
    }

    ev.sort((a, b) => a.t - b.t);
    return ev;
  }

  function hrEntre(res, t0, t1) {
    const s = [];
    for (let i = 0; i < res.ibi.t.length; i++)
      if (res.ibi.t[i] >= t0 && res.ibi.t[i] < t1) s.push(res.ibi.ibi[i]);
    return s.length >= 3 ? 60 / mediana(s) : NaN;
  }

  /* ================================================================ API === */
  function analizar(op) {
    const t0 = performance.now();
    const ir = typeof op.ir === 'string' ? desvarint(op.ir) : op.ir;
    const pot = op.pot ? (typeof op.pot === 'string' ? desvarint(op.pot) : op.pot) : null;
    const fs = op.fs || 100, fsPot = op.fsPot || 10;
    const dur = ir.length / fs;

    const lat = detectarLatidos(ir, fs);
    const ibi = intervalos(lat.t);

    /* Serie temporal. La ventana es de 2 min: respirando a 5 rpm caben 10
       respiraciones, que es el mínimo para que el espectro signifique algo.
       Con 1 min solo caben 5 y el pico baila. En sesiones cortas se encoge. */
    const VENT = Math.max(60, Math.min(120, dur / 4)), SALTO = 15, serie = [];
    for (let a = 0; a + VENT <= dur; a += SALTO) {
      const m = metricas(ibi.ibi, ibi.t, ibi.dif, ibi.tDif, a, a + VENT);
      if (m) {
        m.t = a + VENT / 2;
        delete m.espectro;
        // la respiración de verdad, si el cinturón estaba puesto
        if (pot) m.rpmReal = rpmCinturon(pot, fsPot, a, a + VENT);
        serie.push(m);
      }
    }
    // pulso por minuto, para la gráfica principal
    const porMinuto = [];
    for (let a = 0; a + 30 <= dur; a += 30) {
      const s = [];
      for (let i = 0; i < ibi.t.length; i++) if (ibi.t[i] >= a && ibi.t[i] < a + 30) s.push(ibi.ibi[i]);
      if (s.length >= 8) porMinuto.push({ t: a + 15, hr: 60 / mediana(s) });
    }

    const global = metricas(ibi.ibi, ibi.t, ibi.dif, ibi.tDif, 0, dur) || {};
    const res = {
      dur: dur, fs: fs, tipo: op.tipo || 'libre', objetivoRpm: op.objetivoRpm || null,
      etiqueta: op.etiqueta || '', cuando: op.cuando || '',
      latidos: lat.t.length, onda: lat.onda,
      ibi: ibi, serie: serie, porMinuto: porMinuto, global: global,
      pot: pot, fsPot: fsPot
    };
    res.eventos = eventos(res, op);

    // resumen que va en la cabecera del informe
    const cohs = serie.map(p => p.coherencia).filter(isFinite);
    res.resumen = {
      coherencia: cohs.length ? mediana(cohs) : NaN,
      coherenciaMax: cohs.length ? Math.max.apply(null, cohs) : NaN,
      hr: global.hr, hrMin: porMinuto.length ? Math.min.apply(null, porMinuto.map(p => p.hr)) : NaN,
      rmssd: global.rmssd, sdnn: global.sdnn, pnn50: global.pnn50,
      rsa: mediana(serie.map(p => p.rsa).filter(isFinite)),
      rpm: mediana(serie.map(p => p.rpm).filter(isFinite)),
      cobertura: ibi.cobertura,
      adherencia: op.objetivoRpm
        ? 100 * serie.filter(p => isFinite(p.rpm) &&
            Math.abs(p.rpm - op.objetivoRpm) <= op.objetivoRpm * 0.20).length / Math.max(1, serie.length)
        : NaN
    };
    res.ms = Math.round(performance.now() - t0);
    return res;
  }

  /* ====================================== FRECUENCIA DE RESONANCIA ========
     Cada persona tiene un ritmo al que su corazón oscila MÁS con cada
     respiración. No es 5,5 para todo el mundo: eso es solo la media de la
     población. Depende de tu estatura, tu volumen sanguíneo y el retardo de
     tu barorreflejo, y suele caer entre 4,5 y 6,5 rpm.
     Se encuentra midiendo la amplitud de la oscilación a varios ritmos y
     quedándose con el máximo. El protocolo formal usa pasos guiados; pero si
     una sesión ya tiene ritmos variados, la curva se puede sacar de ella.

     Devuelve la curva (rpm -> amplitud) y el pico con interpolación
     parabólica, que da una resolución mejor que el paso entre ritmos. */
  function resonancia(inf, opc) {
    opc = opc || {};
    const paso = opc.paso || 0.5, minPuntos = opc.minPuntos || 2;
    const bins = new Map();
    for (const p of inf.serie) {
      if (!isFinite(p.rpm) || !isFinite(p.rsa)) continue;
      if (p.rpm < 3 || p.rpm > 9) continue;         // fuera del rango con sentido
      if (p.cobertura < 0.6) continue;              // señal pobre: no cuenta
      const k = Math.round(p.rpm / paso) * paso;
      if (!bins.has(k)) bins.set(k, []);
      bins.get(k).push(p);
    }
    const curva = [];
    for (const [rpm, ps] of bins) {
      if (ps.length < minPuntos) continue;
      curva.push({
        rpm: rpm, n: ps.length,
        rsa: mediana(ps.map(p => p.rsa)),
        coherencia: mediana(ps.map(p => p.coherencia).filter(isFinite)),
        segundos: ps.length * 15
      });
    }
    curva.sort((a, b) => a.rpm - b.rpm);
    if (curva.length < 3) return { curva: curva, pico: null,
      aviso: 'Hacen falta al menos tres ritmos distintos con señal buena.' };

    // el máximo de la curva, afinado entre puntos con una parábola
    let i = 0;
    for (let k = 1; k < curva.length; k++) if (curva[k].rsa > curva[i].rsa) i = k;
    let rpmPico = curva[i].rpm;
    const borde = (i === 0 || i === curva.length - 1);
    if (!borde) {
      const a = curva[i - 1].rsa, b = curva[i].rsa, c = curva[i + 1].rsa;
      const den = a - 2 * b + c;
      if (Math.abs(den) > 1e-9)
        rpmPico = curva[i].rpm + Math.max(-1, Math.min(1, 0.5 * (a - c) / den)) * paso;
    }

    /* ¿Es de fiar? Una resonancia de verdad da una curva con UNA joroba: sube,
       hace pico y baja. Si los valores saltan sin forma, lo que hay es ruido
       y el máximo es casual. Se mide con tres cosas:
         · cuánto sobresale el pico sobre el resto
         · cuánto tiempo se midió en cada ritmo
         · si los vecinos del pico bajan a ambos lados (forma de joroba) */
    const otros = curva.filter((_, k) => k !== i).map(p => p.rsa);
    const prominencia = otros.length ? (curva[i].rsa - mediana(otros)) / mediana(otros) : 0;
    let joroba = 0, lados = 0;
    for (let k = i - 1; k >= 1; k--) { lados++; if (curva[k].rsa <= curva[k + 1].rsa) joroba++; }
    for (let k = i + 1; k < curva.length - 1; k++) { lados++; if (curva[k].rsa <= curva[k - 1].rsa) joroba++; }
    const forma = lados ? joroba / lados : 0;
    const segMin = Math.min.apply(null, curva.map(p => p.segundos));

    let conf, porque;
    if (borde) { conf = 'baja'; porque = 'El máximo cae en el extremo de los ritmos medidos: el tuyo podría estar más allá.'; }
    else if (prominencia < 0.12 || forma < 0.5) {
      conf = 'baja';
      porque = 'La curva no tiene una joroba clara — los valores saltan sin forma, así que el máximo puede ser casualidad.';
    } else if (prominencia > 0.30 && forma >= 0.7 && segMin >= 90) {
      conf = 'buena'; porque = null;
    } else {
      conf = 'media';
      porque = 'La joroba se intuye pero no está limpia. Con la sesión guiada, que mide 2 minutos seguidos por ritmo, saldría firme.';
    }

    const total = curva.reduce((s, p) => s + p.segundos, 0);
    return {
      curva: curva,
      pico: { rpm: rpmPico, rsa: curva[i].rsa, confianza: conf,
              prominencia: prominencia, forma: forma,
              inhala: +(60 / rpmPico * 0.45).toFixed(1),
              exhala: +(60 / rpmPico * 0.55).toFixed(1) },
      minutosUtiles: total / 60,
      aviso: porque
    };
  }

  /* ================================= RESPIRACIÓN REAL, DESDE EL CINTURÓN ==
     Esta es la VERDAD contra la que se compara todo lo demás. El cinturón
     mide el pecho: no hay que deducir nada. Sirve para dos cosas — para el
     informe, y sobre todo para enseñarle a la app cómo respiras, que es lo
     que algún día permitirá quitárselo. */
  function rpmCinturon(pot, fsPot, t0, t1) {
    if (!pot || pot.length < fsPot * 20) return NaN;
    const a = Math.max(0, Math.floor(t0 * fsPot));
    const b = Math.min(pot.length, Math.floor(t1 * fsPot));
    if (b - a < fsPot * 20) return NaN;
    const tramo = pot.slice(a, b);
    // ¿se movió siquiera? un cinturón suelto es una línea plana, no respiración
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < tramo.length; i++) { if (tramo[i] < lo) lo = tramo[i]; if (tramo[i] > hi) hi = tramo[i]; }
    if (hi - lo < 6) return NaN;
    const s = filtfilt(SOS_POT, tramo);
    const esp = welch(s, fsPot, 256);
    if (!esp.f.length) return NaN;
    let mejor = 0, fp = NaN;
    for (let k = 1; k < esp.f.length; k++)
      if (esp.f[k] >= 0.05 && esp.f[k] <= 0.60 && esp.p[k] > mejor) { mejor = esp.p[k]; fp = esp.f[k]; }
    return isFinite(fp) ? fp * 60 : NaN;
  }

  /* ============================================ EXHALACIONES / HUMMING ====
     Para entrenar exhalaciones largas hay que medirlas. El cinturón da la
     curva del pecho: sube al inhalar, baja al exhalar. Cada bajada sostenida
     es una exhalación, y su duración es la marca a batir.

     Además de la duración mide LA FORMA, que es lo que separa una exhalación
     entrenada de una improvisada: la buena vacía a ritmo constante (una rampa
     recta); la mala suelta el aire de golpe y luego se arrastra. */
  function exhalaciones(inf, opc) {
    opc = opc || {};
    const minSeg = opc.minSeg || 4;
    if (!inf.pot || inf.pot.length < 60) return { lista: [], aviso: 'sin cinturón' };
    const fs = inf.fsPot;
    const s = filtfilt(SOS_POT, inf.pot);

    /* Cimas y valles con histéresis. Se siguen el máximo y el mínimo POR
       SEPARADO: si se sigue un solo valor, baja junto con la señal y nunca
       llega a acumular una cima. */
    const HIST = 4;                       // hay que revertir 4 puntos para creerse el giro
    const ext = [];
    let dir = 0, max = s[0], iMax = 0, min = s[0], iMin = 0;
    for (let i = 1; i < s.length; i++) {
      if (s[i] > max) { max = s[i]; iMax = i; }
      if (s[i] < min) { min = s[i]; iMin = i; }
      if (dir !== -1 && s[i] < max - HIST) {
        ext.push({ i: iMax, v: max, tipo: 'cima' });
        dir = -1; min = s[i]; iMin = i;
      } else if (dir !== 1 && s[i] > min + HIST) {
        ext.push({ i: iMin, v: min, tipo: 'valle' });
        dir = 1; max = s[i]; iMax = i;
      }
    }

    const lista = [];
    for (let k = 0; k < ext.length - 1; k++) {
      if (ext[k].tipo !== 'cima' || ext[k + 1].tipo !== 'valle') continue;
      const a = ext[k].i, b = ext[k + 1].i;
      const dur = (b - a) / fs;
      if (dur < minSeg) continue;
      const desde = ext[k].v, hasta = ext[k + 1].v;
      const recorrido = desde - hasta;
      if (recorrido < 12) continue;                   // apenas soltó aire

      /* Constancia del vaciado: se compara la curva real con la rampa recta
         que iría de principio a fin. 100 % = vaciado perfectamente regular. */
      let err = 0, n = 0;
      for (let i = a; i <= b; i++) {
        const u = (i - a) / (b - a);
        err += Math.abs(s[i] - (desde - recorrido * u));
        n++;
      }
      const constancia = Math.max(0, 100 * (1 - (err / n) / (recorrido * 0.25)));

      // qué hizo el pulso durante la exhalación
      const t0 = a / fs, t1 = b / fs;
      const ini = [], fin = [];
      for (let i = 0; i < inf.ibi.t.length; i++) {
        if (inf.ibi.t[i] >= t0 && inf.ibi.t[i] < t0 + dur / 3) ini.push(inf.ibi.ibi[i]);
        if (inf.ibi.t[i] > t1 - dur / 3 && inf.ibi.t[i] <= t1) fin.push(inf.ibi.ibi[i]);
      }
      const perfil = [];
      const paso = Math.max(1, Math.floor((b - a) / 40));
      for (let i = a; i <= b; i += paso) perfil.push(+((s[i] - hasta) / recorrido).toFixed(3));

      lista.push({
        t: t0, dur: dur, desde: desde, hasta: hasta, recorrido: recorrido,
        constancia: constancia, perfil: perfil,
        hrIni: ini.length >= 2 ? 60 / mediana(ini) : NaN,
        hrFin: fin.length >= 2 ? 60 / mediana(fin) : NaN
      });
    }

    const durs = lista.map(e => e.dur);
    return {
      lista: lista,
      n: lista.length,
      masLarga: durs.length ? Math.max.apply(null, durs) : NaN,
      mediana: mediana(durs),
      p90: percentil(durs, 0.9),
      constanciaMedia: mediana(lista.map(e => e.constancia)),
      totalSeg: durs.reduce((s2, v) => s2 + v, 0)
    };
  }

  return { analizar, resonancia, exhalaciones, rpmCinturon, desvarint, detectarLatidos,
           intervalos, metricas, welch, filtfilt, mediana, media, desv, percentil };
})();
