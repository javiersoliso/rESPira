/* ============================================================================
 *  rESPira · ALMACÉN                       sesiones y ajustes, en el teléfono
 * ============================================================================
 *  Todo vive en IndexedDB dentro de la app. Nada sale del teléfono salvo que
 *  tú exportes un CSV.
 *
 *  La señal cruda se guarda EN TROZOS de un segundo, no en un array gigante:
 *  así una noche entera no obliga a tener 170 MB en memoria, y si se corta la
 *  luz solo se pierde el último segundo.
 * ========================================================================== */
window.Almacen = (function () {
  'use strict';

  const VER = 1;
  let db = null;
  const esperando = [];

  function abrir() {
    const rq = indexedDB.open('respira10', VER);
    rq.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('ses'))
        d.createObjectStore('ses', { keyPath: 'id' }).createIndex('ini', 'ini');
      if (!d.objectStoreNames.contains('datos'))
        d.createObjectStore('datos', { autoIncrement: true }).createIndex('sid', 'sid');
      if (!d.objectStoreNames.contains('ajustes'))
        d.createObjectStore('ajustes', { keyPath: 'k' });
    };
    rq.onsuccess = e => { db = e.target.result; esperando.splice(0).forEach(f => f()); };
    rq.onerror = () => console.warn('no pude abrir el almacén');
  }
  abrir();
  const listo = f => db ? f() : esperando.push(f);

  /* ------------------------------------------------------------- ajustes -- */
  const cache = {};
  function ponAjuste(k, v) {
    cache[k] = v;
    listo(() => db.transaction('ajustes', 'readwrite').objectStore('ajustes').put({ k: k, v: v }));
  }
  function leeAjuste(k, pordefecto) {
    return (k in cache) ? cache[k] : pordefecto;
  }
  function cargarAjustes(cuando) {
    listo(() => {
      const st = db.transaction('ajustes').objectStore('ajustes');
      st.openCursor().onsuccess = e => {
        const c = e.target.result;
        if (c) { cache[c.value.k] = c.value.v; c.continue(); }
        else cuando && cuando();
      };
    });
  }

  /* ------------------------------------------------------------ sesiones -- */
  let activa = null, cola = null;

  function empezar(practica) {
    const id = Date.now();
    activa = {
      id: id, practica: practica.id, nombre: practica.nombre, familia: practica.familia,
      informe: practica.informe, ini: id, dur: 0, muestras: 0,
      objetivoRpm: practica.rpmDeUsuario ? leeAjuste('rpm', practica.rpm) : practica.rpm
    };
    cola = { ir: [], pot: [], fs: 0, fsPot: 10 };
    listo(() => db.transaction('ses', 'readwrite').objectStore('ses').put(activa));
    return activa;
  }

  /* Se llama con cada mensaje del sensor. `irl` es el lote de muestras crudas
     que el ESP32 mandó en ese mensaje. */
  function anota(d) {
    if (!activa || !cola) return;
    if (d.irl && d.irl.length) {
      for (const v of d.irl) cola.ir.push(v);
      if (d.per > 1) cola.fs = 1000 / d.per;
    }
    if (typeof d.p === 'number') cola.pot.push(d.p);
    if (cola.ir.length > 4000) volcar();
  }

  function volcar() {
    if (!activa || !cola || (!cola.ir.length && !cola.pot.length)) return;
    const trozo = { sid: activa.id, ir: cola.ir, pot: cola.pot, fs: cola.fs };
    cola = { ir: [], pot: [], fs: cola.fs, fsPot: cola.fsPot };
    activa.muestras += trozo.ir.length;
    listo(() => {
      const tx = db.transaction(['datos', 'ses'], 'readwrite');
      tx.objectStore('datos').add(trozo);
      tx.objectStore('ses').put(activa);
    });
  }

  function terminar(dur) {
    if (!activa) return null;
    volcar();
    activa.dur = dur;
    const fin = activa;
    listo(() => db.transaction('ses', 'readwrite').objectStore('ses').put(fin));
    activa = null; cola = null;
    return fin;
  }

  /* Reconstruye la señal entera de una sesión para dársela al motor. */
  function señal(sid, cuando) {
    listo(() => {
      const st = db.transaction('datos').objectStore('datos').index('sid');
      const ir = [], pot = [];
      let fs = 0;
      st.openCursor(IDBKeyRange.only(sid)).onsuccess = e => {
        const c = e.target.result;
        if (c) {
          const t = c.value;
          for (const v of t.ir) ir.push(v);
          for (const v of t.pot) pot.push(v);
          if (t.fs > fs) fs = t.fs;
          c.continue();
          return;
        }
        /* El cinturón llega a la cadencia de los mensajes (~25 Hz), no a una
           fija. Se calcula la real y se baja a 10 Hz, que es para lo que está
           tabulado el filtro del motor: si no, el corte se iría a 1,75 Hz y
           dejaría pasar ruido que se confundiría con respiración. */
        const FS_POT = 10;
        const fsIr = fs || 100;
        const segundos = ir.length / fsIr;
        const fsReal = segundos > 0 ? pot.length / segundos : FS_POT;
        let pot10;
        if (fsReal > FS_POT * 1.2 && pot.length > 4) {
          const n = Math.floor(segundos * FS_POT);
          pot10 = new Float64Array(n);
          for (let k = 0; k < n; k++) {
            const a = Math.floor(k * fsReal / FS_POT);
            const b = Math.min(pot.length, Math.floor((k + 1) * fsReal / FS_POT));
            let s = 0, c = 0;
            for (let j = a; j < b; j++) { s += pot[j]; c++; }        // media del tramo
            pot10[k] = c ? s / c : pot[Math.min(a, pot.length - 1)];
          }
        } else {
          pot10 = Float64Array.from(pot);
        }
        cuando({ ir: Float64Array.from(ir), pot: pot10, fs: fsIr, fsPot: FS_POT,
                 fsPotReal: fsReal });
      };
    });
  }

  function guardaResumen(sid, resumen) {
    listo(() => {
      const st = db.transaction('ses', 'readwrite').objectStore('ses');
      st.get(sid).onsuccess = e => {
        const s = e.target.result;
        if (!s) return;
        s.resumen = resumen;
        st.put(s);
      };
    });
  }

  function lista(cuantas, cuando) {
    listo(() => {
      const out = [];
      db.transaction('ses').objectStore('ses').openCursor(null, 'prev').onsuccess = e => {
        const c = e.target.result;
        if (c && (!cuantas || out.length < cuantas)) { out.push(c.value); c.continue(); }
        else cuando(out);
      };
    });
  }

  function una(sid, cuando) {
    listo(() => { db.transaction('ses').objectStore('ses').get(sid).onsuccess =
      e => cuando(e.target.result); });
  }

  function borrar(sid, cuando) {
    listo(() => {
      const tx = db.transaction(['ses', 'datos'], 'readwrite');
      tx.objectStore('ses').delete(sid);
      const ix = tx.objectStore('datos').index('sid');
      ix.openKeyCursor(IDBKeyRange.only(sid)).onsuccess = e => {
        const c = e.target.result;
        if (c) { tx.objectStore('datos').delete(c.primaryKey); c.continue(); }
      };
      tx.oncomplete = () => cuando && cuando();
    });
  }

  setInterval(volcar, 1000);
  addEventListener('pagehide', volcar);
  addEventListener('visibilitychange', () => { if (document.hidden) volcar(); });

  return { empezar, anota, terminar, señal, lista, una, borrar, guardaResumen,
           ponAjuste, leeAjuste, cargarAjustes, volcar,
           get activa() { return activa; } };
})();
