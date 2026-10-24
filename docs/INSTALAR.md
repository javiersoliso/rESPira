# rESPira v9.1 · instalación del firmware

## Instalar

1. Copia `firmware/redes.h.ejemplo` a `firmware/redes.h` y escribe tus redes.
   `redes.h` está en el `.gitignore`: las credenciales no entran al repositorio.
2. Abre `firmware/respira_movil_v9_unico.ino` con el entorno de Arduino. El
   entorno exige que la carpeta se llame igual que el `.ino`; si lo copias a tu
   carpeta de proyectos, renómbrala a `respira_movil_v9_unico`.
3. Selecciona la placa ESP32 y súbelo.

Es la variante de **fichero único**: las cabeceras del sensor y de la interfaz
van dentro del propio `.ino`, lo que evita el error
`respira_ppg.h: No such file or directory` que aparece en algunas instalaciones
del entorno de Arduino aunque el fichero esté en la carpeta.

## Novedades de v9.1

### La grabación sigue viva al cambiar de página

Antes la grabación vivía solo en el panel: al pasar a `/vela` la página se
descargaba y la sesión se cortaba. Ahora el estado está en IndexedDB, que
pertenece al origen y no a la página. Se puede empezar a grabar en el panel,
pasar a la vela, volver, y la sesión sigue. Hay un botón de grabar en las tres
páginas y una insignia flotante que indica qué sesión está en marcha y cuántas
filas lleva.

Cambiar de página cuesta unos **0,7 s de datos**: el ESP32 sigue muestreando,
pero el teléfono tarda eso en cargar la página nueva y reconectar el WebSocket.
Para analizar la variabilidad de la frecuencia cardiaca con precisión, conviene
cambiar de página entre bloques, no dentro de uno.

### Las tres páginas hablan el mismo idioma

`/ui.css` y `/grabar.js` los sirve el ESP32 y los usan las tres páginas: misma
barra superior, misma tipografía, mismos componentes. Y sobre todo, **el color
significa siempre lo mismo**:

| color | significa | dónde |
|---|---|---|
| aqua | pulso | el número grande, la onda de fotopletismografía, el punto de latido, el aro de la vela |
| azul | pulmón | el tanque, el potenciómetro, el área de la tira |
| oro | vela | la llama, el lóbulo de arritmia sinusal respiratoria |

La paleta está **validada**, no elegida a ojo: sobre este fondo los tres colores
pasan todas las comprobaciones de separación —incluida la de visión con
deficiencia de color— en todos los pares. El rojo y el ámbar quedan reservados
para estados y siempre van con texto al lado.

### Correcciones del detector (ver [hallazgos.pdf](hallazgos.pdf))

- **Techo en la envolvente de amplitud.** Era el fallo grave de v9: un artefacto
  la disparaba a 25 000 cuentas y tardaba dos minutos en bajar, dejando el
  detector ciego. En una apnea voluntaria de prueba fueron 71 s sin un solo
  latido detectado.
- **El índice de perfusión ya no cierra la puerta.** Un pulso bueno medía 0,03 %
  de la componente continua; el umbral de 0,15 % cerraba justo sobre las mejores
  ventanas.
- Periodo refractario adaptativo, detector de escalón en la componente continua,
  y el valor de latidos por minuto caduca a los 5 s.

### La arritmia sinusal respiratoria, medida de otra forma

Antes era la anchura del lóbulo a media altura, y estaba mal por dos motivos: el
segundo armónico del pulso cae dentro del rango dibujado (a unos 124 latidos por
minuto con un pulso de 62) y el ancho iba del fundamental al armónico —salían
113—; y aunque se midiera solo el lóbulo central, una modulación lenta crea
bandas laterales separadas en vez de ensanchar el pico, así que subestima.

Ahora hay un segundo análisis corto (8 s, más corto que un ciclo respiratorio)
que sigue el pico, y la arritmia es su recorrido en el último minuto. Sigue
subestimando cerca de un 30 % porque la ventana promedia los extremos: sirve
para comparar sesiones entre sí, no como cifra absoluta.

## Lo primero al arrancar

El monitor serie (115200 baudios) escribe la configuración **leída de los
registros del chip**, no la que dice el código:

```
# cfg leida del chip: pw_us=411;bits=18;fondo=262143;sr_hz=200;avg=2;fs_fifo=100;...
```

Si sale `bits=18` y `fs_fifo=100`, la configuración es correcta. Una línea que
empiece por `# AVISO:` indica que el chip no aceptó algún valor.

La cola de datos del MAX30102 no va a 100 Hz sino a **106,7 Hz**, por la
tolerancia de su oscilador. Es normal: el ESP32 envía el periodo que ha medido
para que el teléfono asigne bien los tiempos.

## Antes de grabar

Escribe una **etiqueta** (`S1-apoyo-firme`, `S2-pw-411`…). Va en el nombre del
fichero y dentro del CSV, junto con la configuración del sensor. Sin eso, una
serie de veinte sesiones es imposible de interpretar tres semanas después.

Después, `python analisis/analizar_sesion.py ruta/a/sesion.csv` indica si cada
sesión sirve.
