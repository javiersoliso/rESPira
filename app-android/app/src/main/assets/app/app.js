/* ============================================================================
 *  rESPira · APP                       navegación, pantallas y ciclo de sesión
 * ============================================================================
 *  Cose todo: el enlace con el sensor, el almacén, la guía, el motor de
 *  análisis, el informe y el sonido.
 * ========================================================================== */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const q = (s, r) => (r || document).querySelector(s);
  const n1 = v => isFinite(v) ? v.toFixed(1).replace('.', ',') : '—';
  const n0 = v => isFinite(v) ? Math.round(v).toString() : '—';
  const mmss = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  const COLOR = { calmar: 'var(--pulso-luz)', enfocar: 'var(--aire-luz)',
                  activar: 'var(--rito-luz)', dominar: 'var(--aire-luz)',
                  medir: 'var(--pulso-luz)' };

  let vistaActual = 'v-inicio', informeActual = null, sesionActual = null;

  /* -------------------------------------------------------- navegación --- */
  const NAV = [['v-inicio', '◉', 'Inicio'], ['v-sesiones', '◇', 'Sesiones'],
               ['v-historial', '◫', 'Historial'], ['v-ajustes', '⚙', 'Ajustes']];
  document.querySelectorAll('.nav').forEach(nav => {
    nav.innerHTML = NAV.map(([id, ic, et]) =>
      `<button data-ir="${id}"${id === nav.dataset.nav ? ' class="on"' : ''}>
        <span class="ic">${ic}</span>${et}</button>`).join('');
  });

  function ir(id) {
    if (Guia.corriendo && id !== 'v-guiada') return;
    document.querySelectorAll('.vista').forEach(v => v.classList.toggle('on', v.id === id));
    vistaActual = id;
    scrollTo(0, 0);
    if (id === 'v-historial') pintaHistorial();
    if (id === 'v-ajustes') pintaAjustes();
    if (id === 'v-sonido') pintaSonido();
    if (id === 'v-diagnostico') pintaDiagnostico();
    if (id === 'v-calibrar') empiezaCalibrado();
    if (id === 'v-perfil') pintaPerfil();
    if (id === 'v-datos') pintaDatos();
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-ir]');
    if (b) ir(b.dataset.ir);
  });

  function brindis(txt, ms) {
    const d = $('brindis');
    d.textContent = txt; d.classList.add('on');
    clearTimeout(d._t);
    d._t = setTimeout(() => d.classList.remove('on'), ms || 2600);
  }

  /* ------------------------------------------------------------- inicio -- */
  Enlace.al('estado', s => {
    const ch = $('i-estado');
    if (!s.conectado) {
      ch.className = 'chip ch-mal'; ch.textContent = '○ sin sensor';
      $('i-detalle').textContent = 'buscando…';
      $('i-frase').textContent = 'Enciende el sensor y espera unos segundos.';
      $('i-halo').classList.remove('late');
    } else {
      ch.className = 'chip ch-ok'; ch.textContent = '● sensor listo';
      $('i-detalle').textContent = s.dedo ? 'dedo puesto · señal ' + s.calidad : 'pon el dedo';
    }
  });

  Enlace.al('dato', d => {
    if (vistaActual === 'v-inicio') {
      const bpm = d.g && d.bm ? d.bm : null;
      $('i-bpm').textContent = bpm || '--';
      const halo = $('i-halo');
      if (bpm) {
        halo.style.setProperty('--ibi', (60 / bpm).toFixed(2) + 's');
        halo.classList.add('late');
        $('i-frase').textContent = bpm < 55 ? 'En reposo. Tu calma de siempre.'
          : bpm < 75 ? 'Todo tranquilo.' : 'Algo acelerado.';
      } else {
        halo.classList.remove('late');
        $('i-frase').textContent = d.f ? 'Buscando tu ritmo…' : 'Pon el dedo en el sensor.';
      }
    }
    if (vistaActual === 'v-guiada') {
      $('g-bpm').textContent = (d.g && d.bm) ? d.bm : '--';
      const tq = $('g-tanque');
      if (tq.style.display !== 'none') q('i', tq).style.height = (d.p || 0) + '%';
    }
    if (vistaActual === 'v-calibrar') {
      $('cal-crudo').textContent = d.rn ? Math.round(d.rn) : '--';
      $('cal-nivel').style.height = (d.p || 0) + '%';
    }
  });

  /* ----------------------------------------------------------- sesiones -- */
  let familiaSel = 'calmar';
  function pintaSesiones() {
    $('s-familias').innerHTML = Familias.map(f =>
      `<button data-fam="${f.id}"${f.id === familiaSel ? ' class="on"' : ''}>${f.nombre}</button>`).join('');
    $('s-familias').querySelectorAll('button').forEach(b => b.onclick = () => {
      familiaSel = b.dataset.fam; pintaSesiones();
    });
    const f = Familias.find(x => x.id === familiaSel);
    const ps = Practicas.filter(p => p.familia === familiaSel);
    $('s-lista').innerHTML =
      `<p class="dim2" style="margin-bottom:4px">${f.dice}</p>` +
      ps.map(p => `<button class="item" data-prac="${p.id}">
        <span class="glifo" style="color:${COLOR[p.familia]}">${p.glifo}</span>
        <span style="flex:1"><h4>${p.nombre}</h4><span class="meta">${p.resumen}</span></span>
        <span class="chip ${p.origen === 'ciencia' ? 'ch-ok' : 'ch-rito'}">${
          p.origen === 'ciencia' ? 'ciencia' : 'tradición'}</span>
      </button>`).join('');
    $('s-lista').querySelectorAll('[data-prac]').forEach(b =>
      b.onclick = () => abrePractica(b.dataset.prac));
  }
  pintaSesiones();

  /* ----------------------------------------------------------- práctica -- */
  let practicaSel = null;
  function abrePractica(id) {
    const p = Practicas.find(x => x.id === id);
    if (!p) return;
    practicaSel = p;
    const rpm = p.rpmDeUsuario ? Almacen.leeAjuste('rpm', p.rpm) : p.rpm;
    const record = Almacen.leeAjuste('record', null);
    const necesitaCinturon = p.informe === 'humming';
    const calOk = Almacen.leeAjuste('cal', null);

    $('p-cuerpo').innerHTML = `
      <div>
        <span class="chip ${p.origen === 'ciencia' ? 'ch-ok' : 'ch-rito'}">${
          p.origen === 'ciencia' ? 'ciencia' : 'tradición'}</span>
        <h2 class="tit" style="margin:11px 0 5px;font-size:26px">${p.nombre}</h2>
        <p class="dim">${p.frase}</p>
      </div>
      ${p.fases ? `<div class="tar">
        <div class="rot" style="margin-bottom:12px">El patrón</div>
        <div class="fila" style="gap:20px">
          ${p.fases.map(f => `<div><div class="cifra c-m" style="color:var(--aire-luz)">${
            n1(f[1] * (p.rpmDeUsuario && rpm ? p.rpm / rpm : 1))}<span class="uni">s</span></div>
            <div class="dim2" style="margin-top:4px">${
              { inhala: 'inhala', exhala: 'exhala', reten: 'retén', vacio: 'vacío' }[f[0]]}</div></div>`).join('')}
          <div style="margin-left:auto;text-align:right">
            <div class="cifra c-m">${p.minutos}<span class="uni">min</span></div>
            <div class="dim2" style="margin-top:4px">${n1(rpm)} rpm</div></div>
        </div></div>` : ''}
      ${p.rondas && record ? `<div class="tar">
        <div class="rot" style="margin-bottom:10px">Tus objetivos de hoy</div>
        <div class="fila" style="gap:10px;flex-wrap:wrap">${p.rondas.map((r, k) =>
          `<span class="chip ch-neu">${k + 1}ª · ${Math.round(record * r.objetivo)} s</span>`).join('')}</div>
        <p class="dim2" style="margin-top:10px">Calculados sobre tu récord de ${n1(record)} s.</p>
      </div>` : ''}
      <div><div class="rot" style="margin-bottom:8px">Qué hace</div>
        <p class="dim">${p.explica}</p></div>
      <div><div class="rot" style="margin-bottom:8px">Qué verás</div>
        <p class="dim">${p.esperar}</p></div>
      ${p.avisos.length ? p.avisos.map(a =>
        `<div class="aviso"><span>⚠</span><span>${a}</span></div>`).join('') : ''}
      ${necesitaCinturon && !calOk ? `<div class="aviso">
        <span>◎</span><span><b>El cinturón no está calibrado.</b> Sin eso no puedo medir tus
        exhalaciones. Ve a Ajustes › Calibrar el cinturón: es un minuto.</span></div>` : ''}
      <div style="margin-top:auto;display:flex;flex-direction:column;gap:9px">
        <button class="btn" id="p-empezar"${necesitaCinturon && !calOk ? ' disabled' : ''}>
          Empezar${p.minutos < 100 ? ' · ' + p.minutos + ' min' : ''}</button>
      </div>`;
    const b = $('p-empezar');
    if (b && !b.disabled) b.onclick = () => arranca(p);
    ir('v-practica');
  }

  /* ------------------------------------------------------ sesión guiada -- */
  function arranca(p) {
    if (!Enlace.estado.conectado) { brindis('Sin sensor: enciéndelo y espera un momento.'); return; }
    sesionActual = Almacen.empezar(p);
    const tq = $('g-tanque');
    tq.style.display = (p.informe === 'humming') ? 'block' : 'none';
    $('g-extraRot').textContent = p.informe === 'humming' ? 'objetivo' : 'pulmón';
    $('g-pista').textContent = p.rondas
      ? 'Zumba hasta que se acabe el aire. Toca la pantalla al terminar cada zumbido.'
      : p.fases ? 'Deja que el aro te lleve. Si te pierdes, vuelve sin más.'
      : 'Respira como quieras. Solo estoy midiendo.';
    ir('v-guiada');

    const conSonido = Almacen.leeAjuste('sonido', true);
    const vozId = Almacen.leeAjuste('voz', 'cuenco');
    Guia.empezar(p, { rpm: Almacen.leeAjuste('rpm', null), record: Almacen.leeAjuste('record', 20) },
      { conSonido: conSonido, voz: Voces[vozId] || Voces.cuenco,
        alCambiar: pintaGuia, alTerminar: cierraSesion });
  }

  function pintaGuia(g) {
    $('g-fase').textContent = g.etiqueta;
    $('g-cuenta').textContent = g.cuentaArriba ? mmss(g.restante) : Math.ceil(g.restante);
    $('g-tiempo').textContent = mmss(g.transcurrido);
    $('g-ronda').textContent = g.rotulo;
    const gu = $('g-guia');
    gu.classList.toggle('reten', g.fase === 'reten' || g.fase === 'vacio');
    q('.anillo', gu).style.transform = q('.relleno', gu).style.transform = 'scale(' + g.escala.toFixed(3) + ')';
    if (g.meta) $('g-extra').textContent = Math.round(g.meta) + 's';
    else if ($('g-tanque').style.display === 'none') $('g-extra').textContent = Enlace.estado.pot + '%';
  }

  // en las fases abiertas, tocar la guía pasa a la siguiente
  $('g-guia').addEventListener('click', () => Guia.avanzar());
  $('g-terminar').onclick = () => Guia.terminar();
  $('g-salir').onclick = () => {
    if (confirm('¿Descartar esta sesión?')) {
      const s = Almacen.terminar(0);
      Guia.terminar();
      if (s) Almacen.borrar(s.id);
      ir('v-inicio');
    }
  };

  /* --------------------------------------------- análisis y el informe --- */
  const PASOS = ['Recogiendo la señal', 'Buscando latidos', 'Descartando artefactos',
                 'Midiendo tu variabilidad', 'Buscando momentos', 'Comparando con tu historial'];
  function cierraSesion(dur) {
    const s = Almacen.terminar(dur);
    if (!s || dur < 25) { brindis('Sesión demasiado corta para un informe.'); ir('v-inicio'); return; }
    ir('v-analizando');
    let k = 0;
    const pinta = () => {
      $('a-pasos').innerHTML = PASOS.map((p, j) =>
        `<div class="paso ${j < k ? 'hecho' : j === k ? 'activo' : ''}">
          <span class="pin"></span>${p}</div>`).join('');
    };
    pinta();
    const avanza = setInterval(() => { if (k < PASOS.length - 1) { k++; pinta(); } }, 420);

    Almacen.señal(s.id, sig => {
      setTimeout(() => {
        let inf, html;
        try {
          inf = Motor.analizar({
            ir: sig.ir, fs: sig.fs, pot: sig.pot, fsPot: sig.fsPot,
            tipo: s.informe, objetivoRpm: s.objetivoRpm,
            etiqueta: s.nombre, cuando: new Date(s.ini).toLocaleString('es-ES',
              { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
          });
          html = generaInforme(s, inf);
          /* Cada sesión con cinturón enseña. Va DESPUÉS del informe para que
             un fallo aprendiendo nunca te deje sin informe. */
          try {
            const ap = Perfil.aprender(inf, s.id);
            if (ap) {
              html += bloqueAprendido(ap);
              const e2 = Perfil.estado();
              if (e2.puedeSinCinturon && !Almacen.leeAjuste('avisadoSinCinturon', false)) {
                Almacen.ponAjuste('avisadoSinCinturon', true);
                brindis('Ya puedo estimar tu respiración sin cinturón.', 5000);
              }
            }
          } catch (e2) { /* aprender nunca debe romper el informe */ }
        } catch (e) {
          html = '<div class="tar"><p class="dim">No pude analizar esta sesión: ' + e.message + '</p></div>';
        }
        clearInterval(avanza);
        informeActual = { s: s, inf: inf, html: html };
        $('r-cuerpo').innerHTML = html;
        if (inf) Almacen.guardaResumen(s.id, resumenCorto(s, inf));
        ir('v-informe');
      }, 900);
    });
  }

  /* Un solo esqueleto, con el corazón variable según lo que se hizo. */
  function generaInforme(s, inf) {
    if (s.informe === 'resonancia') {
      const res = Motor.resonancia(inf);
      if (res.pico && res.pico.confianza !== 'baja') {
        Almacen.ponAjuste('rpm', +res.pico.rpm.toFixed(2));
        brindis('Tu ritmo: ' + n1(res.pico.rpm) + ' rpm. Guardado.', 4000);
      }
      return Informe.renderResonancia(inf, res) + Informe.explicarJoroba(inf, res);
    }
    if (s.informe === 'humming') {
      const ex = Motor.exhalaciones(inf);
      const record = Almacen.leeAjuste('record', null);
      if (ex.n && (!record || ex.masLarga > record)) {
        Almacen.ponAjuste('record', +ex.masLarga.toFixed(1));
        brindis('¡Récord nuevo: ' + n1(ex.masLarga) + ' s!', 4000);
      }
      return Informe.renderHumming(inf, ex, record);
    }
    return Informe.render(inf);
  }

  /* Lo que esta sesión le enseñó a la app, al pie del informe. */
  function bloqueAprendido(ap) {
    const e = Perfil.estado();
    const pct = Math.min(100, Math.round(100 * ap.total / Perfil.BUENAS));
    return `<div class="tar" style="border-color:var(--line2)">
      <div class="fila entre" style="margin-bottom:10px">
        <span class="rot">Lo que aprendí de ti aquí</span>
        <span class="chip ch-ok">+${ap.nuevas}</span>
      </div>
      <p class="dim2" style="margin-bottom:11px">Esta sesión dejó <b>${ap.nuevas} parejas</b>
        de «corazón contra pecho». Llevas <b>${e.minutos} minutos</b> de datos emparejados
        en <b>${e.ritmosDistintos} ritmos</b> distintos.</p>
      <div class="barra"><i style="width:${pct}%;background:var(--pulso)"></i></div>
      <p class="dim2" style="margin-top:9px">${
        e.puedeSinCinturon
          ? 'Ya puedo estimar tu respiración sin el cinturón. Sigue usándolo de vez en cuando para no perder puntería.'
          : e.necesitaVariedad && e.minutos > 10
          ? 'Me faltan <b>ritmos variados</b>: has respirado casi siempre igual. Una sesión libre, o «Encontrar tu ritmo», enseña mucho más que otra igual que las anteriores.'
          : 'Me faltan unos <b>' + e.faltanMinutos + ' minutos</b> más con cinturón para poder prescindir de él.'}</p>
    </div>`;
  }

  function resumenCorto(s, inf) {
    const r = inf.resumen;
    if (s.informe === 'coherencia') return n0(r.coherencia) + ' % coherencia';
    if (s.informe === 'humming') return 'exhalación máx.';
    return n0(r.hr) + ' lpm · RMSSD ' + n0(r.rmssd);
  }

  $('r-exportar').onclick = () => {
    if (!informeActual) return;
    exportaCsv(informeActual.s);
  };

  /* ---------------------------------------------------------- historial -- */
  function pintaHistorial() {
    Almacen.lista(40, ses => {
      const conD = ses.filter(x => x.dur > 20);
      $('h-resumen').innerHTML = conD.length
        ? `<div class="rot" style="margin-bottom:8px">Llevas</div>
           <div class="fila entre">
             <div><div class="cifra c-m">${conD.length}</div><div class="dim2">sesiones</div></div>
             <div><div class="cifra c-m">${Math.round(conD.reduce((a, x) => a + x.dur, 0) / 60)}</div>
               <div class="dim2">minutos</div></div>
             <div><div class="cifra c-m">${new Set(conD.map(x => x.practica)).size}</div>
               <div class="dim2">prácticas</div></div>
           </div>`
        : '<p class="dim2">Aún no hay sesiones. Empieza por una de 10 minutos.</p>';
      $('h-lista').innerHTML = conD.map(x => {
        const p = Practicas.find(y => y.id === x.practica) || {};
        return `<button class="item" data-ses="${x.id}">
          <span class="glifo" style="color:${COLOR[x.familia] || 'var(--tx2)'}">${p.glifo || '◦'}</span>
          <span style="flex:1"><h4>${x.nombre}</h4>
          <span class="meta">${new Date(x.ini).toLocaleString('es-ES',
            { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            · ${Math.round(x.dur / 60)} min${x.resumen ? ' · ' + x.resumen : ''}</span></span>
        </button>`;
      }).join('');
      $('h-lista').querySelectorAll('[data-ses]').forEach(b =>
        b.onclick = () => reabre(+b.dataset.ses));
    });
  }

  function reabre(sid) {
    Almacen.una(sid, s => {
      if (!s) return;
      ir('v-analizando');
      $('a-pasos').innerHTML = '<div class="paso activo"><span class="pin"></span>Rehaciendo el informe</div>';
      Almacen.señal(sid, sig => {
        let html;
        try {
          const inf = Motor.analizar({ ir: sig.ir, fs: sig.fs, pot: sig.pot, fsPot: sig.fsPot,
            tipo: s.informe, objetivoRpm: s.objetivoRpm, etiqueta: s.nombre,
            cuando: new Date(s.ini).toLocaleString('es-ES',
              { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) });
          html = s.informe === 'resonancia'
            ? Informe.renderResonancia(inf, Motor.resonancia(inf))
            : s.informe === 'humming'
            ? Informe.renderHumming(inf, Motor.exhalaciones(inf), Almacen.leeAjuste('record', null))
            : Informe.render(inf);
          informeActual = { s: s, inf: inf, html: html };
        } catch (e) { html = '<div class="tar"><p class="dim">' + e.message + '</p></div>'; }
        $('r-cuerpo').innerHTML = html;
        ir('v-informe');
      });
    });
  }

  /* ------------------------------------------------------------ ajustes -- */
  function pintaAjustes() {
    const s = Enlace.estado;
    $('aj-red').textContent = s.conectado
      ? (s.modo === 'estacion' ? 'en ' + s.red + ' · ' + s.ip : 'red propia del sensor · ' + s.ip)
      : 'sin conexión';
    const rpm = Almacen.leeAjuste('rpm', null);
    $('aj-resonancia').textContent = rpm
      ? 'Tu ritmo es ' + n1(rpm) + ' rpm. La coherencia lo usa.'
      : 'Sin medir. La coherencia usa 5,5 rpm de serie.';
    const rec = Almacen.leeAjuste('record', null);
    $('aj-record').textContent = rec ? 'Tu exhalación más larga: ' + n1(rec) + ' s.'
      : 'Sin marca todavía.';
    $('aj-cal').textContent = Almacen.leeAjuste('cal', null) ? 'calibrado' : 'sin calibrar';
    $('aj-voz').textContent = (Voces[Almacen.leeAjuste('voz', 'cuenco')] || {}).nombre || '—';
    const e = Perfil.estado();
    $('aj-perfil').textContent = e.puedeSinCinturon
      ? 'listo · ya puede estimar sin cinturón'
      : e.minutos > 0 ? e.minutos + ' min aprendidos · faltan ' + e.faltanMinutos
      : 'sin datos todavía';
  }
  $('aj-sensor').onclick = () => { Enlace.buscar(); brindis('Buscando el sensor…'); };

  /* ------------------------------------------------------------- sonido -- */
  function pintaSonido() {
    const vozId = Almacen.leeAjuste('voz', 'cuenco');
    $('so-voces').innerHTML = Object.keys(Voces).map(k =>
      `<button class="item" data-voz="${k}">
        <span class="glifo" style="color:var(--rito-luz)">♪</span>
        <span style="flex:1"><h4>${Voces[k].nombre}</h4><span class="meta">${Voces[k].dice}</span></span>
        ${k === vozId ? '<span class="chip ch-ok">activa</span>' : ''}</button>`).join('');
    $('so-voces').querySelectorAll('[data-voz]').forEach(b => b.onclick = () => {
      Almacen.ponAjuste('voz', b.dataset.voz);
      Sonido.iniciar(Voces[b.dataset.voz]); Sonido.campana(null, .55);
      pintaSonido();
    });
    const capas = [['sonido', 'guía sonora'], ['textura', 'textura'],
                   ['campana', 'campana'], ['dron', 'dron'], ['binaural', 'binaural 7 Hz']];
    $('so-capas').innerHTML = capas.map(([k, et]) =>
      `<label class="fila entre"><span class="dim">${et}</span>
        <input type="checkbox" data-capa="${k}" ${Almacen.leeAjuste(k, k !== 'binaural') ? 'checked' : ''}
        style="width:20px;height:20px;accent-color:var(--pulso)"></label>`).join('');
    $('so-capas').querySelectorAll('[data-capa]').forEach(c => c.onchange = () => {
      Almacen.ponAjuste(c.dataset.capa, c.checked);
      const o = {}; o[c.dataset.capa] = c.checked;
      Sonido.ajustar(o);
    });
  }
  $('so-probar').onclick = () => {
    Sonido.iniciar(Voces[Almacen.leeAjuste('voz', 'cuenco')]);
    Sonido.campana(null, .6);
  };

  /* ---------------------------------------------------------- calibrado -- */
  let calLleno = null, calVacio = null;
  function empiezaCalibrado() {
    calLleno = calVacio = null;
    $('cal-paso').textContent = 'Llena el pecho todo lo que puedas y toca «Estoy lleno».';
    $('cal-rango').textContent = 'rango: —';
  }
  $('cal-lleno').onclick = () => {
    calLleno = Enlace.estado.pot;
    $('cal-paso').textContent = 'Ahora suelta TODO el aire y toca «Estoy vacío».';
    $('cal-rango').textContent = 'lleno = ' + calLleno + ' %';
  };
  $('cal-vacio').onclick = () => {
    calVacio = Enlace.estado.pot;
    if (calLleno === null) { brindis('Primero marca el pulmón lleno.'); return; }
    if (Math.abs(calLleno - calVacio) < 15) {
      brindis('Apenas hay diferencia. ¿Está bien puesto el cinturón?', 3500); return;
    }
    Almacen.ponAjuste('cal', { lleno: calLleno, vacio: calVacio, cuando: Date.now() });
    $('cal-rango').textContent = 'lleno = ' + calLleno + ' % · vacío = ' + calVacio + ' %';
    $('cal-paso').textContent = 'Listo. Ya puedo medir tus exhalaciones.';
    brindis('Cinturón calibrado.');
  };
  $('cal-borrar').onclick = empiezaCalibrado;

  /* ------------------------------------------------------------- perfil -- */
  function pintaPerfil() {
    const e = Perfil.estado(), p = e.perfil;
    const pct = Math.min(100, Math.round(100 * (p.parejas || 0) / Perfil.BUENAS));
    $('pf-progreso').innerHTML = `
      <div class="rot" style="margin-bottom:12px">Cuánto lleva aprendido</div>
      <div class="cifra c-l" style="color:var(--pulso-luz)">${e.minutos}<span class="uni">min</span></div>
      <div class="dim2" style="margin:6px 0 12px">de datos con cinturón, en
        ${e.ritmosDistintos} ritmos distintos</div>
      <div class="barra"><i style="width:${pct}%;background:var(--pulso)"></i></div>
      <div class="fila entre" style="margin-top:9px">
        <span class="dim2">${p.parejas || 0} parejas</span>
        <span class="chip ${e.puedeSinCinturon ? 'ch-ok' : pct > 40 ? 'ch-ojo' : 'ch-neu'}">${
          p.calidad || 'sin datos'}</span>
      </div>
      <p class="dim2" style="margin-top:11px">${
        e.puedeSinCinturon
          ? '<b style="color:var(--pulso-luz)">Ya puedo estimar tu respiración sin cinturón.</b> Sigue poniéndotelo de vez en cuando: el cuerpo cambia y el ajuste se desactualiza.'
          : e.necesitaVariedad && e.minutos > 10
          ? 'Tienes datos, pero <b>poco variados</b>. Hacen falta al menos cinco ritmos distintos: prueba «Encontrar tu ritmo» o sesiones libres.'
          : 'Faltan unos <b>' + e.faltanMinutos + ' minutos</b> más con cinturón puesto.'}</p>`;

    $('pf-que').innerHTML = p.listo ? `
      <div class="rot" style="margin-bottom:10px">Qué ha aprendido</div>
      <table class="tabla">
        <tr><td>Error sin corregir</td><td>${n1(p.errorAntes)} rpm</td></tr>
        <tr><td>Error corrigiendo</td><td>${n1(p.errorDespues)} rpm</td></tr>
        <tr><td>Corrección</td><td style="color:${p.usar ? 'var(--pulso-luz)' : 'var(--tx3)'}">${
          p.usar ? 'activa · −' + n1(p.mejora) + ' rpm' : 'desactivada'}</td></tr>
        ${p.rsaTipica ? `<tr><td>Tu oscilación típica</td><td>${p.rsaTipica} ms</td></tr>` : ''}
        ${p.zonaFiable ? `<tr><td>Zona fiable</td><td>${p.zonaFiable.desde}–${p.zonaFiable.hasta} rpm</td></tr>` : ''}
      </table>
      <p class="dim2" style="margin-top:10px">La corrección es una recta:
        <b>real ≈ ${n1(p.a)} + ${n1(p.b)} × estimado</b>. Dos números, no una caja negra:
        se puede mirar y se puede discutir.</p>
      ${!p.usar ? `<p class="dim2" style="margin-top:8px">Está <b>desactivada a propósito</b>:
        corregir no mejoraba el error, así que la app prefiere no tocar nada. Mejor un
        estimador honesto que uno ajustado al ruido.</p>` : ''}`
      : `<div class="rot" style="margin-bottom:10px">Qué ha aprendido</div>
        <p class="dim2">Nada todavía. Necesito al menos ${Perfil.MIN_PAREJAS} parejas
        (unos ${Math.round(Perfil.MIN_PAREJAS * 15 / 60)} minutos con cinturón) para
        empezar a ajustar algo.</p>`;

    $('pf-zonas').innerHTML = (p.zonas && p.zonas.length) ? `
      <div class="rot" style="margin-bottom:10px">Dónde acierta y dónde no</div>
      <table class="tabla">${p.zonas.map(z =>
        `<tr><td>${z.rpm} rpm <span class="dim2">· ${z.n} ventanas</span></td>
          <td style="color:${z.error <= 1 ? 'var(--pulso-luz)' : z.error <= 2 ? 'var(--ojo)' : 'var(--mal)'}">
          ±${n1(z.error)}</td></tr>`).join('')}</table>
      <p class="dim2" style="margin-top:10px">Error típico en cada zona. Donde no hay datos,
        no hay fila: la app no inventa.</p>`
      : '<div class="rot">Dónde acierta</div><p class="dim2" style="margin-top:8px">Aún sin zonas medidas.</p>';

    $('pf-olvidar').onclick = () => {
      if (confirm('¿Borrar todo lo aprendido? Las sesiones no se tocan.')) {
        Perfil.olvidar(); pintaPerfil(); brindis('Perfil olvidado.');
      }
    };
  }

  /* -------------------------------------------------------------- datos -- */
  function pintaDatos() {
    Almacen.lista(0, ses => {
      const conD = ses.filter(s => s.dur > 20);
      const muestras = conD.reduce((a, s) => a + (s.muestras || 0), 0);
      $('da-resumen').innerHTML = `
        <div class="rot" style="margin-bottom:12px">Lo que hay guardado</div>
        <div class="fila entre">
          <div><div class="cifra c-m">${conD.length}</div><div class="dim2">sesiones</div></div>
          <div><div class="cifra c-m">${Math.round(conD.reduce((a, s) => a + s.dur, 0) / 60)}</div>
            <div class="dim2">minutos</div></div>
          <div><div class="cifra c-m">${(muestras / 1e6).toFixed(1)}M</div>
            <div class="dim2">muestras</div></div>
        </div>`;
      $('da-todo').onclick = () => conD.length ? exportaTodo(conD) : brindis('No hay sesiones.');
      $('da-latidos').onclick = () => conD.length ? exportaLatidos(conD) : brindis('No hay sesiones.');
      $('da-borrar').onclick = () => {
        if (!confirm('¿Borrar TODAS las sesiones? Esto no se puede deshacer.')) return;
        if (!confirm('De verdad: se pierden ' + conD.length + ' sesiones. ¿Seguro?')) return;
        let i = 0;
        (function sig() {
          if (i >= ses.length) { brindis('Borrado.'); pintaDatos(); return; }
          Almacen.borrar(ses[i++].id, sig);
        })();
      };
    });
    $('da-parejas').onclick = exportaParejas;
  }

  /* ------------------------------------------------------------- perfil -- */
  function exportaParejas() {
    const P = Perfil.parejas();
    if (!P.length) { brindis('Todavía no hay nada aprendido.'); return; }
    if (!puente()) return;
    const fich = 'respira_parejas_' + Date.now() + '.csv';
    if (!RespiraAndroid.abrirCsv(fich)) { brindis('No pude crear el fichero.'); return; }
    const p = Almacen.leeAjuste('perfil', {}) || {};
    RespiraAndroid.trozoCsv('# parejas cinturon-pulso · perfil: a=' + (p.a != null ? p.a : '') +
      ' b=' + (p.b != null ? p.b : '') + ' error=' + (p.errorDespues != null ? p.errorDespues : '') + '\n' +
      'sid,rpm_real_cinturon,rpm_estimado_pulso,rsa_ms,coherencia,hr\n');
    let linea = '';
    P.forEach((x, i) => {
      linea += x.sid + ',' + x.real + ',' + x.est + ',' + x.rsa + ',' + x.coh + ',' + x.hr + '\n';
      if (i % 500 === 499) { RespiraAndroid.trozoCsv(linea); linea = ''; }
    });
    if (linea) RespiraAndroid.trozoCsv(linea);
    RespiraAndroid.cerrarCsv();
    brindis(P.length + ' parejas en Descargas.', 4000);
  }

  /* Solo los latidos: liviano, y es lo que hace falta para analizar HRV fuera. */
  function exportaLatidos(ses) {
    if (!puente()) return;
    const fich = 'respira_latidos_' + Date.now() + '.csv';
    if (!RespiraAndroid.abrirCsv(fich)) { brindis('No pude crear el fichero.'); return; }
    RespiraAndroid.trozoCsv('sid,practica,t_s,ibi_ms\n');
    let i = 0;
    (function sig() {
      if (i >= ses.length) { RespiraAndroid.cerrarCsv(); brindis('Guardado: ' + fich, 4000); return; }
      const s = ses[i++];
      Almacen.señal(s.id, sig2 => {
        try {
          const lat = Motor.detectarLatidos(sig2.ir, sig2.fs);
          const iv = Motor.intervalos(lat.t);
          let linea = '';
          for (let k = 0; k < iv.t.length; k++)
            linea += s.id + ',' + s.practica + ',' + iv.t[k].toFixed(3) + ',' +
                     Math.round(iv.ibi[k] * 1000) + '\n';
          if (linea) RespiraAndroid.trozoCsv(linea);
        } catch (e) { }
        sig();
      });
    })();
  }

  /* -------------------------------------------------------- diagnóstico -- */
  let dTimer = null;
  function pintaDiagnostico() {
    clearInterval(dTimer);
    const pinta = () => {
      if (vistaActual !== 'v-diagnostico') { clearInterval(dTimer); return; }
      const s = Enlace.estado;
      $('d-enlace').innerHTML = [
        ['Estado', s.conectado ? 'conectado' : 'sin conexión'], ['IP', s.ip || '—'],
        ['Red', s.red || '—'], ['Latencia', s.rtt != null ? s.rtt + ' ms' : '—'],
        ['p95', s.p95 != null ? s.p95 + ' ms' : '—'],
        ['Muestras perdidas', s.perdidas], ['Reinicios del sensor', s.reinicios]
      ].map(f => `<tr><td>${f[0]}</td><td>${f[1]}</td></tr>`).join('');
      $('d-senal').innerHTML = [
        ['Dedo', s.dedo ? 'sí' : 'no'], ['Calidad', s.calidad],
        ['Perfusión', (s.pi || 0).toFixed(3) + ' %'], ['R_norm', Math.round(s.rnorm || 0)],
        ['LED', '0x' + (s.led || 0).toString(16)], ['Edad de la muestra', (s.edad || 0) + ' ms'],
        ['Potenciómetro', (s.pot || 0) + ' %']
      ].map(f => `<tr><td>${f[0]}</td><td>${f[1]}</td></tr>`).join('');
      $('d-cfg').textContent = s.cfg || '—';
    };
    pinta();
    dTimer = setInterval(pinta, 700);
  }
  $('d-noche').onclick = () => {
    if (!Enlace.url) { brindis('Sin sensor.'); return; }
    if (window.RespiraAndroid && RespiraAndroid.descargarUrl) {
      RespiraAndroid.descargarUrl(Enlace.url + '/noche.csv', 'respira_noche.csv');
      brindis('Descargando la caja negra…');
    } else location.href = Enlace.url + '/noche.csv';
  };
  $('d-rescate').onclick = () => Almacen.lista(0, ses => {
    const conD = ses.filter(s => s.dur > 20);
    if (!conD.length) { brindis('No hay sesiones.'); return; }
    exportaTodo(conD);
  });

  /* ---------------------------------------------------------- exportar --- */
  const CABECERA = 'sid,practica,t_ms,ir,pot\n';
  function exportaCsv(s) {
    if (!puente()) return;
    const fich = 'respira_' + s.practica + '_' + s.id + '.csv';
    if (!RespiraAndroid.abrirCsv(fich)) { brindis('No pude crear el fichero.'); return; }
    RespiraAndroid.trozoCsv('# ' + s.nombre + ' · ' + new Date(s.ini).toISOString() +
      ' · ' + Math.round(s.dur) + ' s\n' + CABECERA);
    volcarSesion(s, () => { RespiraAndroid.cerrarCsv(); brindis('Guardado en Descargas: ' + fich, 4000); });
  }
  function exportaTodo(ses) {
    if (!puente()) return;
    const fich = 'respira_todo_' + Date.now() + '.csv';
    if (!RespiraAndroid.abrirCsv(fich)) { brindis('No pude crear el fichero.'); return; }
    RespiraAndroid.trozoCsv(CABECERA);
    let i = 0;
    (function sig() {
      if (i >= ses.length) { RespiraAndroid.cerrarCsv(); brindis('Guardado: ' + fich, 4000); return; }
      volcarSesion(ses[i++], sig);
    })();
  }
  function volcarSesion(s, cuando) {
    Almacen.señal(s.id, sig => {
      const paso = 1000 / (sig.fs || 100);
      let linea = '', n = 0;
      for (let k = 0; k < sig.ir.length; k++) {
        linea += s.id + ',' + s.practica + ',' + Math.round(k * paso) + ',' + sig.ir[k] + ',' +
          (sig.pot[Math.floor(k / (sig.fs / sig.fsPot))] || 0) + '\n';
        if (++n % 2000 === 0) { RespiraAndroid.trozoCsv(linea); linea = ''; }
      }
      if (linea) RespiraAndroid.trozoCsv(linea);
      cuando();
    });
  }
  function puente() {
    if (window.RespiraAndroid && RespiraAndroid.abrirCsv) return true;
    brindis('La exportación necesita la app de Android.');
    return false;
  }

  /* --------------------------------------------------------- el arranque -- */
  Almacen.cargarAjustes(() => {
    Almacen.lista(3, ses => {
      const conD = ses.filter(x => x.dur > 20);
      $('i-ultimas').innerHTML = conD.length ? conD.map(x => {
        const p = Practicas.find(y => y.id === x.practica) || {};
        return `<button class="item" data-ses="${x.id}">
          <span class="glifo" style="color:${COLOR[x.familia] || 'var(--tx2)'}">${p.glifo || '◦'}</span>
          <span style="flex:1"><h4>${x.nombre}</h4><span class="meta">${
            new Date(x.ini).toLocaleString('es-ES', { day: '2-digit', month: 'short',
              hour: '2-digit', minute: '2-digit' })} · ${Math.round(x.dur / 60)} min${
            x.resumen ? ' · ' + x.resumen : ''}</span></span></button>`;
      }).join('') : '<p class="dim2">Todavía ninguna. Empieza por Coherencia cardíaca.</p>';
      $('i-ultimas').querySelectorAll('[data-ses]').forEach(b =>
        b.onclick = () => reabre(+b.dataset.ses));
    });
    const o = {};
    ['textura', 'campana', 'dron', 'binaural'].forEach(k =>
      o[k] = Almacen.leeAjuste(k, k !== 'binaural'));
    Sonido.ajustar(o);
  });

  // el botón atrás de Android
  window.rESPira = window.rESPira || {};
  window.rESPira.atras = function () {
    if (Guia.corriendo) return true;                 // no salir en mitad de una sesión
    if (vistaActual !== 'v-inicio') { ir('v-inicio'); return true; }
    return false;
  };
})();
