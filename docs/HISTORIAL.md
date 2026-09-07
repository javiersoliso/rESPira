# Historial del proyecto

El repositorio publica la versión 9 del firmware y la 10 de la aplicación. Las
anteriores se quedaron fuera porque el código viejo estorba más de lo que
explica, pero el camino sí vale la pena contarlo: casi cada versión nació de
un defecto medido, no de una idea nueva.

## v5 — Prueba de concepto

ESP32 y MAX30102 hablando por I²C, valores crudos por el monitor serie. Servía
para saber que el sensor respondía y poco más.

## v6 — Adquisición y calibración por calidad

El primer firmware con estructura. Servidor web y WebSocket en el ESP32, y una
página local para ver la señal.

De la revisión de la versión 6.1 a la 6.2 salió una lista concreta:
reconstrucción del sello de tiempo al vaciar la memoria intermedia del sensor
—no todas las muestras llevan el mismo instante—, medición de la frecuencia de
muestreo real en vez de la nominal, y una calibración que avanza por calidad de
señal y estabilidad, no por temporizador. La detección de dedo pasó a exigir
tres condiciones a la vez: componente continua suficiente, pulsatilidad y
ausencia de saturación.

## v6.3 a v6.5 — Interfaces

Variantes de visualización, incluida una vista orbital. Aquí el proyecto
todavía servía las páginas desde el ESP32.

## v7 y v8 — Registro y análisis

Grabación de sesiones a archivo y las primeras herramientas en Python para
analizarlas. El análisis empezó a alimentar al firmware, que es cuando el
proyecto se volvió serio.

## v9 — La versión que corrigió lo que el análisis encontró

Del análisis de una sola sesión (403 segundos, 9878 filas) salieron seis
defectos, todos medidos:

1. **El detector estaba ciego.** 48 latidos de unos 217, y la amplitud valía
   cero el 85 % del tiempo. Era un bloqueo mutuo: el umbral se calculaba con la
   mediana de las amplitudes aceptadas, y para aceptar una amplitud había que
   superar el umbral. Vaciado el anillo, no había forma de volver a llenarlo.
   Ahora la envolvente se actualiza en todas las muestras y la puerta de
   calidad bloquea la publicación, nunca el seguimiento.

2. **El control automático de ganancia se desbocaba.** Rampa de 0x3C a 0xFC en
   4,8 segundos. La causa exacta: el paso era de 0x10 cada 400 ms, pero la
   componente continua lenta es una media móvil exponencial con factor 0,02,
   que a 25 Hz tarda dos segundos en enterarse. En esos dos segundos caben
   cinco pasos sobre un objetivo ya alcanzado. Paso de 2, espera de 2,5 s,
   tope en 0x68 y prohibido subir corriente sin dedo.

3. **La presencia de dedo era absoluta.** El umbral `ir > airBase + 4000` deja
   de valer en cuanto cambia la corriente del led. Se reemplazó por una razón
   normalizada, inmune a la ganancia, con sesenta veces de contraste.

4. **El ritmo fantasma con el dedo lejos** no era un latido: era ruido del
   sensor pasado por un filtro pasabanda. Cualquier ruido filtrado entre 0,7 y
   3 Hz oscila cerca de 1 Hz, que son sesenta latidos por minuto.

5. **Los filtros de primer orden** dejaban pasar la deriva de baja frecuencia.
   Se sustituyeron por Butterworth de segundo orden en cascada de biquads.

6. **El registro perdía muestras y usaba el reloj equivocado.** El JavaScript
   escribía una fila por mensaje de WebSocket con la hora del teléfono. De ahí
   el jitter de 54 ms, un hueco de 3,96 s y un 2,8 % de filas repetidas. No era
   el sensor: era la cadena de registro. Ahora el ESP32 manda el lote completo
   con su propio reloj y el teléfono escribe una fila por muestra real.

Además, la configuración del sensor se lee de sus registros al arrancar y se
escribe en la cabecera del archivo de sesión. Sin eso no se pueden comparar dos
sesiones: entre 118 y 411 microsegundos de ancho de pulso la escala cambia por
un factor de 3,5.

## v10 — La interfaz se muda al teléfono

Cambio de fondo: la interfaz dejó de servirse desde el ESP32 y pasó a vivir
dentro de la aplicación Android.

El motivo es de ingeniería, no de gusto. Servir páginas, hojas de estilo y
JavaScript mientras se muestrea a 100 Hz era justo lo que ahogaba al
microcontrolador: páginas a medio cargar, latencias de segundos y cortes de
conexión. Ahora el sensor solo mide y envía muestras; el teléfono, que va
sobrado, hace el resto.

La parte nativa de la aplicación existe para cuatro cosas que una página web no
puede hacer sola: encontrar el sensor en la red (mDNS, última dirección
conocida y barrido de subred), escribir el archivo de sesión a chorros en la
carpeta de descargas —el WebView ignora en silencio las descargas de tipo blob,
y una noche entera no cabe en una cadena de texto—, mantener la pantalla
encendida durante la sesión, y conectarse al punto de acceso del sensor cuando
está en modo portal.
