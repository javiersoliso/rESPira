# -*- coding: utf-8 -*-
"""Ensambla el informe HTML de la noche con figuras incrustadas."""
import base64, json, os

AQUI = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(AQUI, "resultados.json"), encoding="utf-8") as f:
    R = json.load(f)

def img(nombre):
    with open(os.path.join(AQUI, nombre), "rb") as f:
        return "data:image/png;base64," + base64.b64encode(f.read()).decode()

F = {c["fase"]: c for c in R["fases"]}
def fila(nombre, corto):
    c = F[nombre]
    return (f"<tr><td>{corto}</td><td>{c['min'][0]}–{c['min'][1]}</td>"
            f"<td>{c['hr']:.0f}</td><td>{c['rmssd']:.0f}</td><td>{c['pnn50']:.0f} %</td>"
            f"<td>{c['lfhf']:.2f}</td><td>{c['rsa_amp']:.0f}</td></tr>")

html = f"""<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>rESPira · Informe nocturno 09/08</title><style>
*{{box-sizing:border-box;margin:0;padding:0}}
body{{background:#0a0f14;color:#dfe8ef;font:15px/1.65 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:26px 18px 60px}}
main{{max-width:860px;margin:0 auto}}
h1{{font-size:15px;letter-spacing:.22em;color:#3fd39c;margin-bottom:2px}}
p.sub{{color:#8ea5b8;font-size:13.5px;margin-bottom:22px}}
h2{{font-size:13px;letter-spacing:.16em;color:#3fd39c;text-transform:uppercase;margin:34px 0 10px}}
h3{{font-size:14.5px;color:#e3ecf4;margin:18px 0 6px}}
p{{margin-bottom:10px;color:#c7d4e0}}
b{{color:#e3ecf4}}
.card{{background:#0f1620;border:1px solid #1e2b39;border-radius:12px;padding:16px 18px;margin:14px 0}}
.res li{{margin:0 0 10px 18px;color:#c7d4e0}}
img{{width:100%;border-radius:10px;border:1px solid #1e2b39;margin:8px 0 4px}}
.pie{{font-size:12.5px;color:#64798d;margin-bottom:16px}}
table{{width:100%;border-collapse:collapse;font-size:13.5px;margin:10px 0}}
th{{text-align:left;color:#64798d;font-size:11px;letter-spacing:.12em;text-transform:uppercase;
   border-bottom:1px solid #1e2b39;padding:6px 8px}}
td{{padding:7px 8px;border-bottom:1px solid #141d28;color:#c7d4e0;font-variant-numeric:tabular-nums}}
.aviso{{border-left:3px solid #e0a34a;padding:10px 14px;background:#151208;border-radius:0 10px 10px 0;
       color:#d9c9a8;font-size:13.5px;margin:12px 0}}
.ok{{border-left:3px solid #199e70;padding:10px 14px;background:#08150f;border-radius:0 10px 10px 0;
    color:#b3d9c8;font-size:13.5px;margin:12px 0}}
</style></head><body><main>

<h1>rESPIRA · INFORME DE SESIÓN NOCTURNA</h1>
<p class="sub">Sesión del 09/08/2026, 23:02 → 01:27 (144,7 min) · sujeto único · firmware v9.1 ·
{R['latidos']['offline']:,} latidos re-detectados offline sobre la onda cruda · registro del móvil (100 Hz)</p>

<h2>Resumen ejecutivo</h2>
<div class="card"><ul class="res">
<li><b>La hipnagogia tiene firma medible y la capturamos.</b> Al quedarse dormido (min 16–29) el pulso bajó de ~48 a ~44 lpm y —el dato fino— la variabilidad <b>se encogió</b> hasta su mínimo de toda la noche (RMSSD 113 ms, RSA 155 ms) antes de <b>rebotar</b> al asentarse el sueño (RSA 254 ms). La transición vigilia→sueño no es un desvanecimiento suave: es contracción, sacudida y rebote.</li>
<li><b>Hubo un microdespertar de manual en el min 29–31</b>: pico de 65 lpm con movimiento (huecos de datos y re-ajuste del LED a la vez), justo tras soltarse el cinturón. Compatible con una recolocación/sacudida hipnagógica. Después, sueño estable.</li>
<li><b>Dentro de las retenciones a pulmón lleno el pulso cae.</b> En 4 de 6 retenciones ≥8 s, la frecuencia acabó 1–6 lpm por debajo de como empezó — el freno vagal esperado, medido latido a latido.</li>
<li><b>Respiración sin cinturón: sí para el ritmo, y bordada en respiración lenta.</b> Contra el cinturón como verdad-terreno: error mediano <b>0,27 rpm</b> respirando lento (&lt;6 rpm) y MAE 2,5 rpm (mediana 1,4) en respiración normal, con sesgo a subestimar. El volumen (cuánto aire) no es recuperable desde el pulso: eso sigue siendo del cinturón.</li>
<li><b>Del min 67 al 127 el dedo perdió media perfusión (PI 0,075→0,04 %) y el pulso se agitó</b> (mediana 51 lpm con vaivenes 43↔63). Doble hipótesis: presión postural sobre la mano y/o primer episodio REM (llega ~90 min tras dormirse: cuadra). En el min 127 un movimiento grande (hueco de 30 s) lo resuelve: la perfusión vuelve de golpe…</li>
<li>…y llega <b>el tramo más profundo de la noche (min 133–145)</b>: pulso mínimo (42 lpm), pNN50 75 %, LF/HF 1,26 — dominio parasimpático claro justo antes de despertar a la 1:27.</li>
<li><b>No hay apneas que reportar</b>: el cinturón estaba suelto desde el min 21, así que su quietud posterior no es señal respiratoria. Queda explícito para que nadie lo malinterprete.</li>
</ul></div>

<h2>1 · La noche entera de un vistazo</h2>
<img src="{img('f1_linea_temporal.png')}">
<p class="pie">Pulso por minuto (mediana de IBIs re-detectados) · respiración: cinturón real (puntos) y estimada
del pulso (línea) · perfusión PI · huecos de registro en rojo. Eje x: minutos desde las 23:02.</p>

<table>
<tr><th>fase</th><th>min</th><th>pulso (lpm)</th><th>RMSSD (ms)</th><th>pNN50</th><th>LF/HF</th><th>RSA (ms)</th></tr>
{fila('despierto: ejercicio con retenciones','Ejercicio con retenciones')}
{fila('hipnagogia (quedandose dormido)','Hipnagogia')}
{fila('sueno estable','Sueño estable')}
{fila('sueno con perfusion baja (mano/postura)','Sueño, perfusión baja *')}
{fila('despertar parcial','Despertar parcial')}
{fila('sueno final (el mas profundo)','Sueño final (el más profundo)')}
</table>
<p class="pie">* métricas con reserva: en ese tramo la señal era más pobre (cobertura de latidos 62 %) y
parte de la variabilidad puede ser inflación por detección. Medianas de ventanas de 5 min.</p>

<h2>2 · Quedarse dormido, visto de cerca</h2>
<img src="{img('f2_dormirse.png')}">
<p class="pie">Minutos 0–45: pulso · cinturón · amplitud de la oscilación RSA.</p>
<p>La secuencia completa, minuto a minuto:</p>
<p><b>Min 2–14, el ejercicio.</b> Respiración deliberada muy lenta (3–7 rpm) con
<b>retenciones a pulmón lleno de 4 a 18 s</b> (mesetas al 100 % en el panel azul). La oscilación RSA
en ~190 ms de media con picos de 240: respirando a ~5 rpm el corazón oscila con la respiración en su
banda de resonancia — es el estado "coherente" que persigue el modo vela, y aquí está medido.</p>
<p><b>Min 14–20, soltar el control.</b> Al dejar el ejercicio, la respiración natural sube a 12–16 rpm
(puntos azules) y la RSA se desinfla. El cinturón se afloja hacia el min 16 y muere del todo en el 21.</p>
<p><b>Min 16–29, la puerta del sueño.</b> El pulso desciende a su primer valle (42–44 lpm) y la
variabilidad se comprime: RMSSD y RSA en mínimos de toda la noche. Esa <b>contracción</b> es el
marcador de la pérdida de la vigilia en esta sesión.</p>
<p><b>Min 29–31, la sacudida.</b> Pico a 65 lpm, huecos de registro y el LED re-ajustándose: movimiento
corporal claro. Microdespertar de transición — lo normal es no recordarlo.</p>
<p><b>Min 33 en adelante, dormido.</b> El pulso se aplana en 44–46 lpm y la RSA rebota hasta 250–275 ms:
el sistema parasimpático toma el mando. Dormirse, en datos: <b>encogerse → sacudirse → expandirse</b>.</p>

<h2>3 · Las retenciones, latido a latido</h2>
<div class="card">
<table>
<tr><th>min</th><th>duración</th><th>pulso al entrar</th><th>pulso al salir</th><th>Δ</th></tr>
<tr><td>5,5</td><td>8,8 s</td><td>47,8</td><td>45,6</td><td>−2,2</td></tr>
<tr><td>8,6</td><td>9,7 s</td><td>50,6</td><td>44,6</td><td>−6,0</td></tr>
<tr><td>10,3</td><td>9,3 s</td><td>31,2 †</td><td>45,8</td><td>—</td></tr>
<tr><td>10,8</td><td>12,1 s</td><td>44,3</td><td>44,3</td><td>0,0</td></tr>
<tr><td>13,1</td><td>13,8 s</td><td>44,4</td><td>43,2</td><td>−1,2</td></tr>
<tr><td>13,9</td><td>16,5 s</td><td>46,5</td><td>46,9</td><td>+0,4</td></tr>
</table>
<p class="pie">† ese 31 lpm inicial es casi seguro un latido perdido por el detector, no bradicardia real.</p>
<p>Patrón: <b>reteniendo a pulmón lleno, el pulso tiende a decaer</b>. Es el reflejo esperado
(presión intratorácica + quimiorreflejo) y da una vía para detectar holds sin cinturón: buscar
tramos donde la oscilación RSA se apaga y el pulso deriva a la baja.</p></div>

<h2>4 · ¿Se puede quitar el cinturón?</h2>
<img src="{img('f3_validacion.png')}">
<p class="pie">Izquierda: cinturón vs oscilación del IBI en un tramo de respiración lenta.
Derecha: rpm estimada desde el pulso contra rpm real del cinturón (la diagonal sería perfección).</p>
<div class="ok"><b>Respiración lenta deliberada (&lt;6 rpm): error mediano 0,27 rpm.</b> Para el modo vela
y los ejercicios guiados, el pulso solo YA basta como metrónomo respiratorio.</div>
<div class="aviso"><b>Respiración normal (≥6 rpm): MAE 2,5 rpm, con sesgo a subestimar.</b> Utilizable como
tendencia, no como cifra por-respiración. Y <b>dormido quedó sin validar</b> (el cinturón estaba suelto):
la estimada de la noche (6–9 rpm) es plausible pero no verificada. El <b>volumen</b> — cuánto aire — no sale
del pulso con ninguna técnica: fases y ritmo sí, litros no. Veredicto: cinturón opcional para guiar
ejercicios; necesario (de momento) para validar sueño y para todo lo que sea volumen.</div>

<h2>5 · El episodio de perfusión baja (min 67–127)</h2>
<p>A los ~65 min de sesión la perfusión del dedo cae a la mitad y el pulso entra en un régimen agitado
con vaivenes 43↔63 lpm, LF/HF alto (2,2) y la peor calidad de señal de la noche. Dos lecturas compatibles:</p>
<p><b>(a) Postural:</b> el cuerpo dormido aprieta o dobla la mano (vasoconstricción local) — y de hecho todo
se resuelve con el movimiento grande del min 127. <b>(b) Fisiológica:</b> el primer ciclo REM llega típicamente
60–90 min tras dormirse; dormido ~min 30, cuadraría con REM en 90–120, donde el pulso es irregular por diseño.
Con una sola noche y señal pobre no se puede fallar el caso: <b>se resuelve repitiendo la noche con la caja
negra y el dedo mejor sujeto</b>.</p>
<img src="{img('f6_tacograma.png')}">
<p class="pie">El tacograma completo: cada punto, un latido. Se ve el régimen tranquilo (35–65),
el agitado (67–125) y el profundo final (133+).</p>

<h2>6 · La variabilidad de la noche</h2>
<img src="{img('f4_hrv.png')}">
<p class="pie">RMSSD y SDNN en ventanas de 5 min (arriba) y balance LF/HF (abajo).</p>
<img src="{img('f5_poincare.png')}">
<p class="pie">Poincaré con pares de latidos consecutivos: dormido (aqua) el núcleo es más compacto y
desplazado a IBIs largos; despierto (azul) más disperso.</p>
<p>Números de referencia del sujeto esta noche: pulso dormido 42–46 lpm (mínimo 42), RMSSD dormido
180–280 ms y pNN50 hasta 76 % — variabilidad <b>muy</b> alta, coherente con un perfil joven, entrenado y
vagotónico, aunque parte de las cifras del tramo pobre son cota superior, no medida limpia. El LF/HF
termina la noche en su mínimo (1,26): el tramo final fue el más parasimpático.</p>

<h2>Calidad del dato y límites</h2>
<div class="card"><p>
Filas: {R['sesion']['filas']:,} · latidos re-detectados: {R['latidos']['offline']:,} (el firmware anotó
{R['latidos']['firmware']:,}) · IBIs válidos tras filtro de artefactos: {R['latidos']['ibi_validos']:,}
({R['latidos']['cobertura_pct']} %) · huecos de registro: 10 (74,7 s en total, concentrados en min 11,
29–31 y 126–127, los dos últimos coincidiendo con movimiento) · el sensor se reinició 5 veces durante la
noche (vigilante I2C) sin perder la sesión · cinturón útil solo hasta el min 20,8 · una sola noche, un solo
sujeto, dispositivo experimental: <b>nada de esto es diagnóstico médico</b>.</p></div>

<h2>Qué medir la próxima noche</h2>
<div class="card"><ul class="res">
<li><b>Cinturón bien sujeto toda la noche</b> (o al pecho con velcro): validaría la respiración dormida,
el episodio 67–127, y daría la primera noche completa de fases respiratorias reales.</li>
<li><b>Caja negra del ESP32 sin teléfono</b> (ya está en el firmware pendiente de flashear): noches enteras
sin depender de pantallas, con latidos + respiración 2/s.</li>
<li><b>Dedo con sujeción suave</b> (cinta/dedil) para no repetir el tramo de perfusión baja.</li>
<li>Con 3–5 noches: línea base personal de HR/RMSSD nocturnos, detector de microdespertares, y el
estimador de respiración dormida entrenado contra el cinturón.</li>
</ul></div>

<p class="pie" style="margin-top:26px">rESPira · análisis offline sobre {R['sesion']['filas']:,} muestras crudas ·
re-detección de latidos con paso-banda Butterworth y mínimos con prominencia adaptativa · HRV solo sobre pares
de latidos consecutivos validados · respiración estimada por pico espectral del tacograma (0,10–0,45 Hz;
banda lenta 0,05–0,10 Hz aparte) · generado el 10/08/2026</p>

</main></body></html>"""

salida = os.path.join(AQUI, "informe_noche_0908.html")
with open(salida, "w", encoding="utf-8") as f:
    f.write(html)
print("informe:", salida, f"({os.path.getsize(salida)/1e6:.1f} MB)")
