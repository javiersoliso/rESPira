# Hardware

## Esquema de conexiones

![Esquema de conexiones](figuras/conexiones.png)

## Lista de materiales

| Pieza | Referencia | Notas |
|---|---|---|
| Microcontrolador | ESP32 DevKitC (o equivalente con WiFi) | Necesita `WiFiNetworkSpecifier`, así que la aplicación pide Android 10 o superior |
| Sensor óptico | MAX30102 (módulo con regulador a 3V3) | Infrarrojo 880 nm y rojo 660 nm, comunicación I²C |
| Sensor de respiración | Potenciómetro lineal de 10 kΩ | Acoplado a un cinturón torácico; el cursor se desplaza al expandirse la caja torácica |
| Alimentación | USB o batería de litio con módulo de carga | Ver la sección de la carcasa |

## Conexiones

**MAX30102**

| Módulo | ESP32 | Nota |
|---|---|---|
| VIN | 3V3 | El módulo trae regulador; no alimentar a 5 V sin él |
| GND | GND | |
| SCL | D22 | Reloj I²C |
| SDA | D21 | Datos I²C |
| INT | D19 | Cableado pero sin usar en el firmware actual |

**Potenciómetro de 10 kΩ**

| Terminal | ESP32 | Nota |
|---|---|---|
| Riel alto | D25 | Pin de propósito general, no 3V3 |
| Cursor | D33 | Entrada analógica, ADC1 canal 5 |
| Riel bajo | D32 | Pin de propósito general, no GND |

Los rieles van a pines de propósito general y no a las líneas de alimentación
por dos razones: el firmware puede apagar el divisor cuando no está midiendo,
y la referencia queda limpia de la caída que introduce el consumo del sensor
óptico. Es un detalle que cuesta un pin y ahorra ruido.

**Importante sobre el canal analógico.** D33 pertenece a ADC1. El ADC2 del
ESP32 queda inutilizable cuando el WiFi está activo, y aquí el WiFi está
siempre activo. Si se cambia de pin, tiene que ser otro de ADC1.

## Consideraciones de la señal óptica

Del análisis que dio origen a la versión 9 (documentado en `hallazgos.pdf`):

- La corriente del led se limita a `0x68` (unos 20,8 mA). Por encima de `0x7C`
  el convertidor recorta con el dedo puesto.
- La presencia de dedo se detecta con `R_norm = IR_DC / LED_PA`, que es inmune
  a los cambios de ganancia. Con dedo ronda 2117; sin dedo, 35. Sesenta veces
  de contraste.
- El filtro es un Butterworth de segundo orden entre 0,8 y 2,5 Hz en cascada
  de biquads. Con filtros de primer orden se colaba la deriva de baja
  frecuencia, y el ruido filtrado en esa banda oscila cerca de 1 Hz: sesenta
  latidos por minuto que no existen.

## Siguiente paso: carcasa impresa en 3D

Hoy el conjunto es una protoboard. Para que salga del escritorio hace falta
una carcasa. Esto es una propuesta de diseño, no algo ya construido.

### Qué tiene que resolver

1. **Presión constante sobre el dedo.** Es el requisito que manda. La
   fotopletismografía es sensible a la presión de contacto: poca y la señal se
   pierde, mucha y se ocluye el lecho capilar. Una pinza con resorte suave
   —del orden de 1 a 2 newtons— repite mejor que una correa ajustada a mano.
2. **Bloqueo de luz ambiente.** El infrarrojo del sol y el parpadeo de las
   lámparas entran directo a la banda de interés. Un labio de goma alrededor
   de la ventana y filamento opaco (negro, no translúcido) resuelven la mayor
   parte.
3. **Ventana enrasada.** El sensor tiene que quedar a ras de la superficie de
   contacto, sin escalón. Un rebaje de 0,2 mm sobre el módulo basta.
4. **Alivio de tensión en el cable.** El cable del cinturón torácico es lo
   primero que se rompe. Un pasacables con nudo interno, no un agujero.
5. **Acceso al conector de carga** sin abrir la caja.

### Distribución propuesta

Dos piezas separadas unidas por cable, no un bloque único:

**Módulo de dedo** — solo el MAX30102 y cuatro hilos. Cuanto más ligero, menos
artefacto por movimiento. Una pinza tipo oxímetro de pulso comercial es la
referencia a copiar: la geometría ya está resuelta por la industria.

**Módulo de cintura** — el ESP32, la batería y la electrónica de carga, sujeto
al mismo cinturón que lleva el potenciómetro. Ahí el peso no molesta.

| Componente | Dimensiones aproximadas | Nota |
|---|---|---|
| ESP32 DevKitC | 55 × 28 × 13 mm | Dejar libre el conector USB |
| Batería de litio 503450 | 50 × 34 × 5 mm, unos 1000 mAh | Formato plano, cómodo en cintura |
| Módulo de carga TP4056 con protección | 26 × 17 × 5 mm | Usar la versión **con** protección de descarga profunda |
| Interruptor deslizante | 12 × 5 mm | |
| Holgura interna | 2 mm por lado | Para cables y tolerancia de impresión |

Volumen resultante: alrededor de 62 × 40 × 22 mm.

### Notas de impresión

- Ácido poliláctico o polietileno tereftalato glicol sirven; el segundo aguanta
  mejor el calor de un carro estacionado al sol.
- Paredes de 1,6 mm (cuatro perímetros a 0,4 mm) y 20 % de relleno.
- Encaje a presión con tolerancia de 0,2 mm por lado, o cuatro tornillos M2 de
  6 mm con inserto térmico. Los insertos duran mucho más que roscar el plástico.
- Imprimir la pinza del dedo con la bisagra en el plano de la cama para que las
  capas no trabajen a tracción.

### Cómo abordarlo

Modelar en SolidWorks, que es la herramienta del programa de mecatrónica y la
que produce planos acotados presentables para la tesis. Blender sirve para
renderizar la pieza final, no para diseñarla con cotas.

Orden sugerido: medir las piezas reales con calibrador → croquis 2D de la
sección → extrusión y vaciado → imprimir una prueba solo del alojamiento del
sensor para validar el enrase antes de gastar filamento en la carcasa completa.
