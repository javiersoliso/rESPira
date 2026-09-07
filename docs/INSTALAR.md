# rESPira v9.1 · instalación

Esta carpeta **es** el sketch. No hay parche que aplicar: está todo integrado.

## Instalar

Copia la carpeta a `C:\Users\javie\Desktop\AI\claude\rESPira\`, como
**hermana** de `respira_movil` (no dentro). Debe quedar así:

```
rESPira\
    respira_movil\            <- el viejo, intacto por si hay que volver
    respira_movil_v9\         <- este
        respira_movil_v9.ino
        respira_ppg.h  ui.h
        pot_cal.h  pulso.h  vela.h  wifi_setup.h
```

La carpeta ya se llama igual que el `.ino`, así que no hay que renombrar nada.
Abre el `.ino` con el IDE de Arduino y sube.

> Si te sale **`respira_ppg.h: No such file or directory`** teniendo el fichero
> delante, usa la variante de **fichero único**: lleva las cabeceras dentro del
> propio `.ino` y ese fallo no puede ocurrir.

## Novedades de v9.1

### La grabación sigue viva al cambiar de página

Antes vivía solo en el panel: al irte a `/vela` la página se descargaba y la
sesión se cortaba. Ahora el estado está en IndexedDB, que es del origen y no de
la página. Empiezas a grabar en el panel, te vas a la vela, vuelves, y sigue.
Hay un botón de grabar en las tres, y una insignia flotante que dice qué sesión
está en marcha y cuántas filas lleva.

Cambiar de página cuesta unos **0,7 s de datos**: el ESP32 sigue muestreando,
pero el móvil tarda eso en cargar la página nueva y reconectar el WebSocket.
Si vas a analizar HRV con precisión, cambia de página entre bloques, no dentro.

### Las tres páginas hablan el mismo idioma

`/ui.css` y `/grabar.js` los sirve el ESP32 y los usan las tres. Misma barra
superior, misma tipografía, mismos componentes. Y sobre todo, **el color
significa siempre lo mismo**:

| color | significa | dónde |
|---|---|---|
| aqua | pulso | el número grande, la onda PPG, el punto de latido, el aro de la vela |
| azul | pulmón | el tanque, el potenciómetro, el área de la tira |
| oro | vela | la llama, el lóbulo de RSA |

La paleta está **validada**, no elegida a ojo: sobre este fondo los tres pasan
todas las comprobaciones de separación —incluida la de visión con deficiencia
de color— en todos los pares. El rojo y el ámbar quedan reservados para estados
y siempre van con texto al lado.

### Correcciones del detector (ver `rESPira_hallazgos.pdf`)

- **Techo en la envolvente de amplitud.** Era el fallo grave de v9: un artefacto
  la disparaba a 25 000 cuentas y tardaba dos minutos en bajar, dejando el
  detector ciego. En tu aguante del Whistle fueron 71 s sin un solo latido.
- **La PI ya no cierra la puerta.** Tu pulso bueno mide 0,03 % del DC; el umbral
  de 0,15 % cerraba justo sobre las mejores ventanas.
- Refractario adaptativo, detector de escalón de DC, y el BPM caduca a los 5 s.

### El número de RSA, medido de otra forma

Era la anchura del lóbulo a media altura, y estaba mal por dos motivos: el 2.º
armónico de tu pulso cae dentro del rango dibujado (a ~124 lpm si lates a 62) y
el ancho iba del fundamental al armónico —salían 113 lpm—; y aunque se midiera
solo el lóbulo central, una modulación lenta crea bandas laterales separadas en
vez de ensanchar el pico, así que subestima.

Ahora hay un segundo análisis corto (8 s, más corto que un ciclo respiratorio)
que sigue el pico, y la RSA es su recorrido en el último minuto. Sigue
subestimando un ~30 % porque la ventana promedia los extremos: úsalo para
comparar sesiones entre sí, no como cifra absoluta.

## Lo primero al arrancar

El monitor serie (115200) escribe la configuración **leída de los registros del
chip**, no la que dice el código:

```
# cfg leida del chip: pw_us=411;bits=18;fondo=262143;sr_hz=200;avg=2;fs_fifo=100;...
```

Si sale `bits=18` y `fs_fifo=100`, correcto. Si sale un `# AVISO:`, apúntamelo.

Y ojo con esto: tu FIFO no va a 100 Hz sino a **106,7** — tolerancia del
oscilador del MAX30102. Es normal, y ahora el ESP32 manda el periodo que ha
medido para que el móvil marque bien los tiempos.

## Antes de grabar

Escribe una **etiqueta** (`S1-apoyo-firme`, `S2-pw-411`…). Va en el nombre del
fichero y dentro del CSV, junto con la configuración del sensor. Sin eso, una
serie de veinte sesiones es imposible de interpretar tres semanas después.

Después: `python3 analizar_sesion.py *.csv` te dice si cada una sirve.
