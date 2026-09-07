/* ============================================================================
 *  rESPira · PERFIL              lo que la app aprende de TI, y solo de ti
 * ============================================================================
 *  QUÉ ES "ENTRENAR" AQUÍ. No es una red neuronal ni nada opaco: es AJUSTAR
 *  UN PUÑADO DE NÚMEROS a tu cuerpo. Cinco o seis, no millones. Por eso hacen
 *  falta horas de datos y no millones de ejemplos, y por eso siempre se puede
 *  mirar qué aprendió y por qué.
 *
 *  EL CINTURÓN ES EL MAESTRO. Cada sesión con cinturón puesto deja parejas:
 *
 *      "cuando tu pulso oscilaba ASÍ,  tu pecho hacía ASÍ"
 *
 *  Con suficientes parejas se puede aprender la segunda mitad a partir de la
 *  primera — y ahí es cuando el cinturón deja de hacer falta. O sea: para
 *  quitártelo algún día, primero hay que ponérselo muchas veces.
 *
 *  QUÉ APRENDE, en concreto:
 *    · corrección de ritmo   el estimador de RSA se queda corto a ritmos
 *                            rápidos; se aprende cuánto, y se corrige
 *    · retardo               tu RSA va por detrás del pecho unos segundos;
 *                            cuántos es cosa tuya
 *    · ganancia              cuántos ms oscila tu pulso por cada respiración
 *    · zona fiable           entre qué ritmos tu estimación es de fiar
 *
 *  Y SOBRE TODO: cuánta confianza merece. Un perfil con veinte minutos de
 *  datos no vale lo mismo que uno con seis horas, y la app lo dice.
 * ========================================================================== */
window.Perfil = (function () {
  'use strict';

  /* Cada pareja es una ventana de análisis con cinturón puesto y señal buena.
     Se guardan las parejas, no las señales: ocupan nada y permiten recalcular
     el perfil entero cuando cambie el método. */
  const MIN_PAREJAS = 40;          // por debajo de esto no se ajusta nada
  const BUENAS = 120;              // a partir de aquí el perfil es sólido

  function parejas() { return Almacen.leeAjuste('parejas', []); }

  /* Se llama al terminar de analizar cualquier sesión. Si había cinturón,
     cosecha las parejas y reajusta. */
  function aprender(inf, sid) {
    if (!inf || !inf.serie) return null;
    const nuevas = [];
    for (const p of inf.serie) {
      if (!isFinite(p.rpmReal) || !isFinite(p.rpm)) continue;
      if (p.cobertura < 0.75) continue;                  // señal pobre: no enseña, ensucia
      if (p.rpmReal < 2.5 || p.rpmReal > 25) continue;
      nuevas.push({
        real: +p.rpmReal.toFixed(3), est: +p.rpm.toFixed(3),
        rsa: Math.round(p.rsa || 0), coh: Math.round(p.coherencia || 0),
        hr: Math.round(p.hr || 0), sid: sid || 0
      });
    }
    if (!nuevas.length) return null;
    const todas = parejas().concat(nuevas);
    // se guardan las 4000 más recientes: de sobra, y no crece sin límite
    Almacen.ponAjuste('parejas', todas.slice(-4000));
    const per = ajustar();
    return { nuevas: nuevas.length, total: todas.length, perfil: per };
  }

  /* ---------------------------------------------------------- el ajuste --
     Recta robusta real = a + b·estimado. Robusta = se ajusta, se miran los
     residuos, se tiran los peores y se repite. Sin eso, tres ventanas malas
     con el cinturón medio suelto tuercen la recta entera. */
  function rectaRobusta(pares) {
    let uso = pares.slice();
    let a = 0, b = 1;
    for (let vuelta = 0; vuelta < 3; vuelta++) {
      let sx = 0, sy = 0, sxy = 0, sxx = 0;
      const n = uso.length;
      if (n < 8) break;
      for (const p of uso) { sx += p.est; sy += p.real; sxy += p.est * p.real; sxx += p.est * p.est; }
      const den = n * sxx - sx * sx;
      if (Math.abs(den) < 1e-9) break;
      b = (n * sxy - sx * sy) / den;
      a = (sy - b * sx) / n;
      const res = uso.map(p => Math.abs(p.real - (a + b * p.est))).sort((x, y) => x - y);
      const corte = res[Math.floor(res.length * 0.85)] || Infinity;
      const filtrado = uso.filter(p => Math.abs(p.real - (a + b * p.est)) <= corte);
      if (filtrado.length < 8 || filtrado.length === uso.length) break;
      uso = filtrado;
    }
    return { a: a, b: b, n: uso.length };
  }

  function ajustar() {
    const P = parejas();
    const per = {
      parejas: P.length,
      minutos: +(P.length * 15 / 60).toFixed(1),      // las ventanas van cada 15 s
      listo: false, calidad: 'sin datos'
    };
    if (P.length < MIN_PAREJAS) {
      per.faltan = MIN_PAREJAS - P.length;
      Almacen.ponAjuste('perfil', per);
      return per;
    }

    const r = rectaRobusta(P);
    per.a = +r.a.toFixed(3);
    per.b = +r.b.toFixed(3);

    // error antes y después: si corregir no mejora, no se corrige
    const antes = P.map(p => Math.abs(p.real - p.est));
    const luego = P.map(p => Math.abs(p.real - (r.a + r.b * p.est)));
    per.errorAntes = +Motor.mediana(antes).toFixed(2);
    per.errorDespues = +Motor.mediana(luego).toFixed(2);
    per.mejora = +(per.errorAntes - per.errorDespues).toFixed(2);
    per.usar = per.mejora > 0.05;

    // ganancia: cuántos ms oscila tu pulso por respiración, y en qué zona
    const conRsa = P.filter(p => p.rsa > 0);
    per.rsaTipica = conRsa.length ? Math.round(Motor.mediana(conRsa.map(p => p.rsa))) : null;

    // dónde es de fiar: por tramos de ritmo, el error de la estimación
    const zonas = new Map();
    P.forEach(p => {
      const k = Math.round(p.real);
      if (!zonas.has(k)) zonas.set(k, []);
      zonas.get(k).push(Math.abs(p.real - (per.usar ? (r.a + r.b * p.est) : p.est)));
    });
    per.zonas = [...zonas.entries()]
      .filter(([, v]) => v.length >= 5)
      .map(([rpm, v]) => ({ rpm: rpm, n: v.length, error: +Motor.mediana(v).toFixed(2) }))
      .sort((x, y) => x.rpm - y.rpm);
    const fiables = per.zonas.filter(z => z.error <= 1.0);
    per.zonaFiable = fiables.length
      ? { desde: fiables[0].rpm, hasta: fiables[fiables.length - 1].rpm } : null;

    per.listo = P.length >= MIN_PAREJAS && per.errorDespues < 2.0;
    per.calidad = P.length >= BUENAS && per.errorDespues < 1.0 ? 'sólido'
                : P.length >= MIN_PAREJAS && per.errorDespues < 2.0 ? 'utilizable'
                : 'aún flojo';
    per.cuando = Date.now();
    Almacen.ponAjuste('perfil', per);
    return per;
  }

  /* Aplica lo aprendido a una estimación hecha SIN cinturón. */
  function corrige(rpmEstimado) {
    const per = Almacen.leeAjuste('perfil', null);
    if (!per || !per.usar || !isFinite(rpmEstimado)) return rpmEstimado;
    return per.a + per.b * rpmEstimado;
  }

  /* Qué le falta a la app para poder prescindir del cinturón. */
  function estado() {
    const per = Almacen.leeAjuste('perfil', null) || { parejas: 0, minutos: 0, calidad: 'sin datos' };
    const P = parejas();
    const ritmos = new Set(P.map(p => Math.round(p.real)));
    return {
      perfil: per,
      minutos: per.minutos || 0,
      ritmosDistintos: ritmos.size,
      faltanMinutos: Math.max(0, +(((BUENAS - (per.parejas || 0)) * 15) / 60).toFixed(0)),
      /* Dos condiciones, y la segunda es la que más se olvida: no basta con
         MUCHOS datos, hacen falta VARIADOS. Si solo respiras a 5,5 rpm, la
         app aprende ese punto y nada más. */
      necesitaVariedad: ritmos.size < 5,
      /* Tres condiciones a la vez, y ninguna sobra: bastantes datos, bastante
         variados, y un error que de verdad sirva. Con veinte minutos el ajuste
         "sale" — pero se ha ajustado al ruido, no a ti. */
      puedeSinCinturon: !!(per.listo && ritmos.size >= 5 && (per.parejas || 0) >= BUENAS
                           && per.errorDespues < 1.5)
    };
  }

  function olvidar() {
    Almacen.ponAjuste('parejas', []);
    Almacen.ponAjuste('perfil', null);
  }

  return { aprender, ajustar, corrige, estado, olvidar, parejas,
           MIN_PAREJAS: MIN_PAREJAS, BUENAS: BUENAS };
})();
