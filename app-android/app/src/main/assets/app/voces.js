/* ============================================================================
 *  rESPira · VOCES                       el sonido como DATOS, no como código
 * ============================================================================
 *  Una voz describe entera cómo suena una sesión. Cambiar el sonido es
 *  escribir otro objeto como estos — no tocar el motor de audio.
 *
 *  campana   parciales [proporción, amplitud, cola en s]. Un cuenco no es una
 *            nota: son parciales INARMÓNICOS (2.02, 3.01, 4.17…) apagándose
 *            cada uno a su ritmo. Poner 2, 3, 4 exactos suena a órgano.
 *  textura   el ruido que respira contigo. Cada fase fija a dónde va el
 *            filtro, el volumen y la posición en el espacio.
 *  dron      notas sostenidas por debajo, en proporciones sobre la nota base.
 *  sala      la reverberación: segundos de cola y cuánto se mezcla.
 *
 *  Para inventar una: copia la más parecida, cambia números, escúchala.
 * ========================================================================== */
window.Voces = {

  cuenco: {
    nombre: 'Cuenco',
    dice: 'Metal cálido con cola larga. El de serie.',
    campana: {
      base: 528, volumen: 0.32, golpe: 0.012,
      parciales: [[1, 1, 4.2], [2.02, 0.50, 3.1], [3.01, 0.28, 2.2],
                  [4.17, 0.16, 1.5], [5.43, 0.09, 1.0]],
      batido: { mul: 1.006, amp: 0.35, cola: 3.8 },
      porFase: { inhala: 660, exhala: 440, reten: 880 }
    },
    textura: {
      ruido: 'rosa', filtro: 'bandpass', q: 0.9,
      inhala: { hz: 1150, gan: 0.30, y: 0.9, z: -0.45 },
      exhala: { hz: 260, gan: 0.15, y: -0.5, z: -1.4 },
      reten:  { hz: 520, gan: 0.07, y: 0, z: -1.0 }
    },
    dron: { nota: 110, voces: [[1, 0.50, 0], [1.5, 0.18, 0.6], [2, 0.18, -0.6]],
            inhala: 0.10, exhala: 0.16, reten: 0.13 },
    sala: { seg: 2.4, mojado: 0.32, seco: 0.78 }
  },

  mar: {
    nombre: 'Mar',
    dice: 'Sin campana. Solo olas: la respiración es el sonido.',
    campana: {
      base: 300, volumen: 0.07, golpe: 0.09,
      parciales: [[1, 1, 1.1], [1.51, 0.3, 0.8]],
      batido: null,
      porFase: { inhala: 300, exhala: 220, reten: 300 }
    },
    textura: {
      ruido: 'marron', filtro: 'lowpass', q: 0.7,
      inhala: { hz: 900, gan: 0.46, y: 0.5, z: -0.3 },
      exhala: { hz: 180, gan: 0.30, y: -0.3, z: -1.8 },
      reten:  { hz: 400, gan: 0.16, y: 0, z: -1.0 }
    },
    dron: { nota: 55, voces: [[1, 0.4, 0], [2, 0.1, 1.2]],
            inhala: 0.07, exhala: 0.11, reten: 0.09 },
    sala: { seg: 3.6, mojado: 0.42, seco: 0.7 }
  },

  cristal: {
    nombre: 'Cristal',
    dice: 'Alto y transparente. Parciales casi puros, poca sala.',
    campana: {
      base: 1056, volumen: 0.22, golpe: 0.004,
      parciales: [[1, 1, 3.2], [2.76, 0.34, 2.4], [5.40, 0.14, 1.6], [8.93, 0.05, 0.9]],
      batido: { mul: 1.003, amp: 0.22, cola: 3.0 },
      porFase: { inhala: 1056, exhala: 792, reten: 1408 }
    },
    textura: {
      ruido: 'blanco', filtro: 'bandpass', q: 3.2,
      inhala: { hz: 2600, gan: 0.14, y: 1.2, z: -0.4 },
      exhala: { hz: 900, gan: 0.08, y: -0.4, z: -1.2 },
      reten:  { hz: 1600, gan: 0.05, y: 0, z: -0.8 }
    },
    dron: { nota: 220, voces: [[1, 0.28, 0], [3, 0.07, 1.5]],
            inhala: 0.06, exhala: 0.09, reten: 0.07 },
    sala: { seg: 1.6, mojado: 0.24, seco: 0.85 }
  },

  vacio: {
    nombre: 'Vacío',
    dice: 'Casi nada. Un toque seco y silencio. Para quien el sonido estorba.',
    campana: {
      base: 440, volumen: 0.16, golpe: 0.002,
      parciales: [[1, 1, 0.5], [2.4, 0.2, 0.3]],
      batido: null,
      porFase: { inhala: 587, exhala: 440, reten: 660 }
    },
    textura: {
      ruido: 'rosa', filtro: 'lowpass', q: 0.5,
      inhala: { hz: 300, gan: 0.05, y: 0, z: -1 },
      exhala: { hz: 200, gan: 0.03, y: 0, z: -1 },
      reten:  { hz: 250, gan: 0.01, y: 0, z: -1 }
    },
    dron: { nota: 110, voces: [[1, 0.3, 0]], inhala: 0, exhala: 0, reten: 0 },
    sala: { seg: 1.0, mojado: 0.10, seco: 0.92 }
  }
};
