/* ============================================================================
 *  rESPira · PRÁCTICAS                          catálogo y clasificación
 * ============================================================================
 *  DOS EJES, no uno. Clasificar solo por origen (ciencia / tradición) deja
 *  fuera lo que de verdad importa al elegir: qué te hace. Y clasificar solo
 *  por efecto esconde de dónde sale. Así que van los dos, independientes:
 *
 *    FAMILIA  · qué le hace a tu sistema nervioso     (calmar, enfocar,
 *               activar, dominar, medir)
 *    ORIGEN   · de dónde viene y con qué respaldo     (ciencia, tradición)
 *
 *  Una práctica de tradición puede ser calmante y otra activante; una de la
 *  literatura, también. Son ejes que se cruzan, no una jerarquía.
 * ========================================================================== */

window.Familias = [
  { id: 'calmar', nombre: 'Calmar', glifo: '◡', color: 'pulso',
    dice: 'Bajan revoluciones. Exhalación larga, ritmo lento, freno vagal.',
    informe: 'Manda la variabilidad: cuánto se abrió tu pulso y cuánto duró la calma.' },
  { id: 'enfocar', nombre: 'Enfocar', glifo: '◧', color: 'aire',
    dice: 'Estabilizan. Ritmos simétricos y contables para agarrarse a algo firme.',
    informe: 'Manda la regularidad: cuánto te ceñiste al compás sin desviarte.' },
  { id: 'activar', nombre: 'Activar', glifo: '✦', color: 'rito',
    dice: 'Suben revoluciones a propósito: hiperventilación controlada y frío.',
    informe: 'Manda la respuesta: cuánto subió y, sobre todo, cuánto tardaste en volver.' },
  { id: 'dominar', nombre: 'Dominar el aliento', glifo: '◉', color: 'aire',
    dice: 'Entrenan el control puro: exhalaciones larguísimas, retenciones, tolerancia al CO₂.',
    informe: 'Manda la marca: duración, forma del vaciado y tu récord personal.' },
  { id: 'medir', nombre: 'Medir', glifo: '◫', color: 'pulso',
    dice: 'No entrenan nada: sacan un número tuyo para compararte contigo.',
    informe: 'Manda la cifra y su margen de error. Sin adornos.' }
];

window.Practicas = [

  /* ------------------------------------------------------------- MEDIR --- */
  {
    id: 'resonancia', familia: 'medir', origen: 'ciencia', glifo: '◉',
    nombre: 'Encontrar tu ritmo',
    resumen: '7 ritmos · 15 min · se hace una vez',
    frase: 'La app descubre TU frecuencia de resonancia. No la de la media de la gente.',
    /* Siete escalones, y bajando hasta 3,5: con la curva de Javier vimos que
       a 4,5 rpm todavía SUBÍA, así que un protocolo que pare ahí se queda sin
       ver la cima. Mejor sobrar por abajo que quedarse corto. */
    pasos: [{ rpm: 6.5, seg: 120 }, { rpm: 6.0, seg: 120 }, { rpm: 5.5, seg: 120 },
            { rpm: 5.0, seg: 120 }, { rpm: 4.5, seg: 120 }, { rpm: 4.0, seg: 120 },
            { rpm: 3.5, seg: 120 }],
    fases: null, rpm: null, minutos: 15, informe: 'resonancia',
    explica: `Tu ritmo de resonancia depende de tu estatura, tu volumen de sangre y el retardo
      de tu barorreflejo. La media cae en 5,5 rpm, pero el rango normal va de 4,5 a 6,5 — y usar
      el de otro te deja a medio gas. Esta sesión prueba siete ritmos y mide en cuál oscila más
      tu corazón.`,
    esperar: 'Al final te da tu ritmo con un decimal, y queda guardado como el de tu coherencia.',
    avisos: ['Sentado, tranquilo y sin interrupciones: cualquier movimiento ensucia la curva.']
  },
  {
    id: 'libre', familia: 'medir', origen: 'ciencia', glifo: '◈',
    nombre: 'Sesión libre',
    resumen: 'sin guía · tú mandas · enseña a la app',
    frase: 'Respira como te salga. Esta es la que le enseña a la app cómo respiras TÚ.',
    fases: null, rpm: null, minutos: 15, informe: 'coherencia',
    enseña: true,
    explica: `Sin aro, sin cuentas, sin objetivos: haces lo que te sale y lo que se siente
      bien. Con el cinturón puesto, cada minuto de esta sesión le enseña a la app una pareja
      de datos — lo que hizo tu corazón y lo que hacía tu pecho a la vez. Son las sesiones
      que más enseñan, porque pasas por ritmos variados de forma natural en vez de clavarte
      en uno solo.`,
    esperar: 'Tu informe de siempre, y además el perfil de la app un poco más afinado.',
    avisos: ['Ponte el cinturón. Sin él la sesión vale igual para ti, pero no enseña nada.']
  },
  {
    id: 'hrv-reposo', familia: 'medir', origen: 'ciencia', glifo: '◫',
    nombre: 'HRV en reposo',
    resumen: '5 min tumbado',
    frase: 'La medida estándar, siempre igual, para poder compararte contigo.',
    fases: null, rpm: null, minutos: 5, informe: 'hrv',
    explica: `Cinco minutos tumbado, respirando normal, sin guía. Es el protocolo con el que se
      mide la variabilidad en la literatura, y su gracia está en repetirlo siempre igual: a la
      misma hora, en la misma postura.`,
    esperar: 'RMSSD, SDNN y LF/HF, con tu línea base de las últimas semanas al lado.',
    avisos: []
  },
  {
    id: 'noche', familia: 'medir', origen: 'ciencia', glifo: '☾',
    nombre: 'Noche completa',
    resumen: 'hasta 10 h · sin teléfono',
    frase: 'El sensor graba solo. Tú duermes.',
    fases: null, rpm: null, minutos: 480, informe: 'noche',
    explica: `Enchufa el sensor a la batería y deja el teléfono donde quieras. Guarda cada latido
      y la respiración dos veces por segundo en su propia memoria. Por la mañana lo descargas.`,
    esperar: 'Pulso mínimo, variabilidad por tramos, despertares y fases estimadas.',
    avisos: ['Sujeta bien el dedo: la mayoría de las noches que salen mal son de contacto.']
  },

  /* ------------------------------------------------------------ CALMAR --- */
  {
    id: 'coherencia', familia: 'calmar', origen: 'ciencia', glifo: '◍',
    nombre: 'Coherencia cardíaca',
    resumen: 'tu ritmo · 10 min',
    frase: 'El ritmo al que tu corazón y tu respiración entran en resonancia.',
    fases: [['inhala', 5.0], ['exhala', 5.9]], rpm: 5.5, rpmDeUsuario: true,
    minutos: 10, informe: 'coherencia',
    explica: `A tu ritmo de resonancia, la subida y bajada natural de tu pulso se sincroniza con
      el reflejo que regula tu presión arterial, y el corazón empieza a oscilar como una onda
      limpia. Si aún no has medido el tuyo, la app usa 5,5 rpm.`,
    esperar: 'La oscilación de tu pulso debería crecer hasta 150–250 ms por respiración.',
    avisos: []
  },
  {
    id: 'cuatro-siete-ocho', familia: 'calmar', origen: 'ciencia', glifo: '◑',
    nombre: '4·7·8 para dormir',
    resumen: '8 ciclos · 4 min',
    frase: 'Inhalas 4, retienes 7, exhalas 8. Para bajar el interruptor.',
    fases: [['inhala', 4], ['reten', 7], ['exhala', 8]], rpm: 3.2,
    minutos: 4, ciclos: 8, informe: 'retenciones',
    explica: `La exhalación larga y la retención empujan el sistema nervioso hacia el freno.
      Popularizada por Andrew Weil como puente al sueño. Ocho ciclos bastan.`,
    esperar: 'Tu pulso suele caer dentro de cada retención y rebotar al exhalar.',
    avisos: ['Si te mareas, vuelve a respirar normal y acorta la retención.']
  },
  {
    id: 'vela', familia: 'calmar', origen: 'ciencia', glifo: '✧',
    nombre: 'La vela',
    resumen: 'biofeedback · libre',
    frase: 'Sin números. Exhala fuerte y casi la apagas.',
    fases: null, rpm: null, minutos: 8, informe: 'meditacion',
    explica: `La llama responde a tu aliento en tiempo real. No hay cifras ni objetivos: la
      práctica para los días en que los números estorban.`,
    esperar: 'El informe llega después, no durante: la gracia es no mirar nada mientras.',
    avisos: []
  },
  {
    id: 'bhramari', familia: 'calmar', origen: 'tradicion', glifo: '◐',
    nombre: 'Bhramari · la abeja',
    resumen: 'zumbido corto · 7 min',
    frase: 'Zumbas al exhalar, con los oídos tapados. El cráneo vibra.',
    fases: [['inhala', 4], ['exhala', 8]], rpm: 5, minutos: 7, informe: 'humming',
    explica: `Pranayama clásico: inhalación normal y exhalación zumbando con la boca cerrada,
      tapándote los oídos con los pulgares para que la vibración se oiga por dentro. El zumbido
      multiplica por quince el óxido nítrico que sale de tus senos nasales.`,
    esperar: 'Exhalaciones de 8–15 s y una caída clara del pulso dentro de cada una.',
    avisos: ['Si tienes infección de oído o de senos, sáltala.']
  },
  {
    id: 'ujjayi', familia: 'calmar', origen: 'tradicion', glifo: '≋',
    nombre: 'Ujjayi · el océano',
    resumen: 'garganta entornada · 10 min',
    frase: 'Estrechas la glotis y el aire suena a marea.',
    fases: [['inhala', 5], ['exhala', 7]], rpm: 5, minutos: 10, informe: 'coherencia',
    explica: `Se respira por la nariz estrechando ligeramente la garganta, lo que frena el flujo
      y alarga la exhalación sola. El sonido sirve de metrónomo: si deja de oírse, te desviaste.`,
    esperar: 'Ritmo muy estable sin esfuerzo, cerca de tu zona de resonancia.',
    avisos: []
  },

  /* ----------------------------------------------------------- ENFOCAR --- */
  {
    id: 'caja', familia: 'enfocar', origen: 'ciencia', glifo: '◧',
    nombre: 'Caja 4·4·4·4',
    resumen: '3,75 rpm · 8 min',
    frase: 'Cuatro lados iguales. Para el foco bajo presión.',
    fases: [['inhala', 4], ['reten', 4], ['exhala', 4], ['vacio', 4]], rpm: 3.75,
    minutos: 8, informe: 'retenciones',
    explica: `Simétrica y contable, por eso funciona cuando la cabeza va acelerada: da algo firme
      a lo que agarrarse. Usada en entrenamiento militar; de ahí lo de respiración táctica.`,
    esperar: 'Ritmo muy estable, con cuatro tramos iguales por ciclo.',
    avisos: []
  },
  {
    id: 'nadi-shodhana', familia: 'enfocar', origen: 'tradicion', glifo: '☯',
    nombre: 'Nadi Shodhana',
    resumen: 'fosas alternas · 11 min',
    frase: 'Tapas una fosa, luego la otra. Equilibrio y atención fina.',
    fases: [['inhala', 5], ['exhala', 6]], rpm: 5.5, minutos: 11, informe: 'coherencia',
    explica: `Se alterna la fosa nasal con la que se inhala y exhala usando los dedos. Obliga a un
      ritmo lento y a una atención constante: es difícil despistarse haciéndola.`,
    esperar: 'Ritmo lento sostenido y muy pocas desviaciones.',
    avisos: []
  },
  {
    id: 'silencio', familia: 'enfocar', origen: 'ciencia', glifo: '○',
    nombre: 'Silencio medido',
    resumen: 'sin guía · libre',
    frase: 'No te dice nada. Solo mide, y te lo cuenta al final.',
    fases: null, rpm: null, minutos: 15, informe: 'meditacion',
    explica: `Sin guía visual ni sonora. Meditas como medites, y la app se limita a registrar
      qué le pasó a tu cuerpo mientras.`,
    esperar: 'Tiempo en calma, deriva del pulso y cuántas veces te fuiste.',
    avisos: []
  },

  /* -------------------------------------------------- DOMINAR EL ALIENTO -- */
  {
    id: 'humming-largo', familia: 'dominar', origen: 'tradicion', glifo: '◉',
    nombre: 'Zumbido largo',
    resumen: 'exhalaciones máximas · 12 min',
    frase: 'Una nota sostenida hasta el final del aire. Entrena la exhalación, no el ritmo.',
    /* Serie progresiva: no se marca un ritmo, se marca un OBJETIVO por ronda,
       calculado sobre tu récord. La app escucha el zumbido con el micrófono y
       mide con el cinturón cuánto vacías y con qué constancia. */
    rondas: [
      { objetivo: 0.6, descanso: 45 }, { objetivo: 0.75, descanso: 45 },
      { objetivo: 0.85, descanso: 60 }, { objetivo: 0.95, descanso: 60 },
      { objetivo: 1.05, descanso: 75 }, { objetivo: 1.0, descanso: 60 }
    ],
    fases: null, rpm: null, minutos: 12, informe: 'humming',
    usaMicrofono: true,
    explica: `Inhalas cómodo por la nariz y sueltas el aire zumbando una sola nota, lo más
      parejo que puedas, hasta el final. Cada ronda te pide un poco más que la anterior,
      calculado sobre tu propia marca. No es una práctica de ritmo: es de control.`,
    esperar: 'Duración de cada zumbido, lo parejo que vaciaste, y tu récord personal.',
    avisos: ['Sentado y en seco. Nunca en el agua ni de pie.',
             'Si ves puntos o te mareas, para: eso es falta de oxígeno, no progreso.']
  },
  {
    id: 'exhalacion-1-2', familia: 'dominar', origen: 'ciencia', glifo: '◡',
    nombre: 'Exhalación 1:2',
    resumen: '4 dentro · 8 fuera · 10 min',
    frase: 'Exhalar el doble que inhalar. La versión sencilla del freno.',
    fases: [['inhala', 4], ['exhala', 8]], rpm: 5, minutos: 10, informe: 'coherencia',
    explica: `La regla más simple que funciona: que la salida dure el doble que la entrada.
      Sin retenciones, sin cuentas raras, sin nada que memorizar.`,
    esperar: 'Ritmo cercano a 5 rpm y buena oscilación del pulso.',
    avisos: []
  },

  /* ----------------------------------------------------------- ACTIVAR --- */
  {
    id: 'wim-hof', familia: 'activar', origen: 'tradicion', glifo: '✦',
    nombre: 'Wim Hof',
    resumen: '30 respiraciones + retención · 3 rondas',
    frase: 'Hiperventilas, sueltas el aire y aguantas en vacío.',
    fases: null, rpm: null, minutos: 15, informe: 'retenciones',
    explica: `Treinta respiraciones profundas y rápidas, se exhala y se aguanta con los pulmones
      vacíos todo lo que salga; luego una inhalación y quince segundos de retención. Tres rondas.`,
    esperar: 'Cada retención con su duración, la caída del pulso y cuánto tardas en recuperarte.',
    avisos: ['NUNCA en el agua, ni de pie, ni conduciendo: el desmayo llega sin aviso.',
             'No la hagas si estás embarazada, tienes epilepsia o problemas de corazón.']
  },
  {
    id: 'kapalabhati', familia: 'activar', origen: 'tradicion', glifo: '❋',
    nombre: 'Kapalabhati · cráneo brillante',
    resumen: 'exhalaciones rápidas · 3 rondas',
    frase: 'Golpes cortos de aire con el abdomen. Despierta.',
    fases: null, rpm: null, minutos: 6, informe: 'retenciones',
    explica: `Exhalaciones activas y cortas empujando con el abdomen; la inhalación se deja caer
      sola. Rondas breves con descanso entre ellas.`,
    esperar: 'Subida clara del pulso y su vuelta a la calma después de cada ronda.',
    avisos: ['Sentado. Si notas hormigueo en las manos, para.',
             'No la hagas con el estómago lleno, embarazada, ni con hipertensión.']
  },
  {
    id: 'tummo', familia: 'activar', origen: 'tradicion', glifo: '✧',
    nombre: 'Tummo · calor interior',
    resumen: '15 min · avanzada',
    frase: 'Respiración fuerte con contracción y visualización de calor.',
    fases: null, rpm: null, minutos: 15, informe: 'retenciones',
    explica: `Práctica tibetana que combina respiración vigorosa, contracción muscular sostenida
      y visualización. Es exigente: conviene llegar con las otras ya rodadas.`,
    esperar: 'Tramos de activación intensa alternados con recuperación.',
    avisos: ['Las mismas que Wim Hof: nunca en el agua ni de pie.']
  }
];
