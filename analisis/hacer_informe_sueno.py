# -*- coding: utf-8 -*-
"""Informe: cruce con el Galaxy Watch + analisis de 430 noches de sueño."""
import base64, json, os

AQUI = os.path.dirname(os.path.abspath(__file__))
def img(n):
    with open(os.path.join(AQUI, n), "rb") as f:
        return "data:image/png;base64," + base64.b64encode(f.read()).decode()
def js(n):
    with open(os.path.join(AQUI, n), encoding="utf-8") as f:
        return json.load(f)

C = js("cruce_reloj.json"); H = js("historico_sueno.json"); F = js("fragmentacion.json")
fase = C["respira_por_fase_del_reloj"]

html = f"""<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>rESPira · Sueño: el reloj, rESPira y 6 años de datos</title><style>
*{{box-sizing:border-box;margin:0;padding:0}}
body{{background:#0a0f14;color:#dfe8ef;font:15px/1.65 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:26px 18px 60px}}
main{{max-width:880px;margin:0 auto}}
h1{{font-size:15px;letter-spacing:.22em;color:#3fd39c;margin-bottom:2px}}
p.sub{{color:#8ea5b8;font-size:13.5px;margin-bottom:22px}}
h2{{font-size:13px;letter-spacing:.16em;color:#3fd39c;text-transform:uppercase;margin:34px 0 10px}}
p{{margin-bottom:10px;color:#c7d4e0}} b{{color:#e3ecf4}}
.card{{background:#0f1620;border:1px solid #1e2b39;border-radius:12px;padding:16px 18px;margin:14px 0}}
ul li{{margin:0 0 10px 18px;color:#c7d4e0}}
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
.rojo{{border-left:3px solid #e66767;padding:10px 14px;background:#170b0b;border-radius:0 10px 10px 0;
      color:#e8b9b9;font-size:13.5px;margin:12px 0}}
</style></head><body><main>

<h1>rESPIRA · SUEÑO: DOS SENSORES Y SEIS AÑOS</h1>
<p class="sub">Noche del 09-10/08/2026 medida a la vez por rESPira (dedo, 100 Hz) y Galaxy Watch (muñeca)
· más el histórico completo del reloj: <b>430 noches entre 2020 y 2026</b></p>

<h2>Lo que hay que saber</h2>
<div class="card"><ul>
<li><b>rESPira quedó validado contra un aparato comercial.</b> En las 4 horas que coinciden, la diferencia
media entre ambos es de <b>1,5 lpm</b> (sesgo +1,3). Tu bradicardia nocturna es real y la miden los dos.</li>
<li><b>El 34 lpm ocurrió a las 04:00</b>, cuando rESPira ya había dejado de grabar (01:27). No lo podemos
confirmar ni desmentir: viene solo del reloj, y es un mínimo instantáneo, no un nivel sostenido.</li>
<li><b>Pillamos al reloj equivocándose, con prueba.</b> Declaró que te dormiste a las 23:07 — pero rESPira
estaba registrando <b>respiración deliberada a 3-7 rpm con retenciones de hasta 18 s</b> hasta las 23:16.
Nadie hace apneas voluntarias dormido. De esos 12 minutos despierto, el reloj etiquetó 5 como "sueño ligero".</li>
<li><b>Y sus etiquetas parecen invertidas en tu caso.</b> En los tramos que el reloj llama REM, rESPira midió
<b>el pulso MÁS BAJO y el tono vagal MÁS ALTO</b> de la noche; en los que llama profundo, un pulso más alto.
Eso es al revés de la fisiología de manual — sugiere que parte de tu sueño profundo se le está archivando
como REM (encaja con el 36,7 % de REM de esa noche, tu récord en 430 noches).</li>
<li><b>Aun así, tu sueño profundo es genuinamente bajo, y desde hace años:</b> mediana de <b>{H['profundo_pct']['mediana']} %
({F['bloque_profundo_max_mediana_min']} min de bloque más largo)</b> frente a un 13-23 % de referencia, sostenido a lo
largo de 430 noches. Esto no se explica solo por el algoritmo.</li>
<li><b>Pero tu sueño NO está fragmentado:</b> {F['despertares_por_hora']['mediana']} despertares/hora de mediana
(normal hasta ~2/h; solo el {F['pct_noches_muy_fragmentadas']} % de tus noches pasan de 5/h). Es un dato importante,
porque el sueño roto es la firma típica de la apnea — y no aparece.</li>
<li><b>El factor más accionable está en tus propios datos:</b> te acuestas a las <b>00:37 de mediana con una
desviación de {H['hora_acostarse_std_h']} horas</b>. Ese horario tardío e irregular es, con diferencia, la palanca
más grande que tienes y la única que depende solo de ti.</li>
</ul></div>

<h2>1 · Los dos sensores, la misma noche</h2>
<img src="{img('f7_reloj.png')}">
<p class="pie">Arriba: hipnograma del reloj con hora local; sombreado, las ventanas que rESPira identificó.
Abajo: pulso de ambos. El reloj solo da una media por hora (punto) con su rango (barra) — el export no
incluye el detalle por minuto, así que no se puede dibujar como línea continua sin inventar resolución.</p>

<table>
<tr><th>hora</th><th>rESPira (mediana)</th><th>reloj (media)</th><th>diferencia</th></tr>
{"".join(f"<tr><td>{h}</td><td>{a:.1f} lpm</td><td>{b:.1f} lpm</td><td>{a-b:+.1f}</td></tr>"
         for h, a, b in C['acuerdo_horario']['detalle'])}
</table>
<div class="ok"><b>MAE {C['acuerdo_horario']['mae_lpm']} lpm en {C['acuerdo_horario']['horas']} horas.</b>
Para un sensor casero de dedo contra un reloj comercial, es un acuerdo excelente — y valida de paso toda
la cadena de rESPira: sensor, detector de latidos y reloj interno.</div>

<h2>2 · La prueba de que el reloj se equivoca contigo</h2>
<div class="card">
<p>Entre las <b>23:04 y las 23:16</b> sabemos exactamente qué hacías, porque el cinturón lo registró:
respiración deliberada a 3-7 rpm con seis retenciones a pulmón lleno de entre 4 y 18 segundos. Estabas
despierto, sin ninguna duda posible.</p>
<p>El reloj clasificó esos minutos como: <b>5 min de sueño ligero</b> y 4 de vigilia. Y fijó tu inicio de
sueño a las <b>23:07</b>, en plena serie de apneas voluntarias.</p>
<p>El mecanismo es claro: respirar muy lento, quieto y con el pulso bajo <i>se parece</i> a dormir para un
algoritmo de muñeca. Es el mismo motivo por el que meditar suele contar como sueño en estos aparatos.</p>
</div>

<h2>3 · rESPira dentro de cada fase del reloj</h2>
<table>
<tr><th>fase según el reloj</th><th>tramos</th><th>pulso</th><th>RMSSD</th><th>pNN50</th></tr>
{"".join(f"<tr><td>{k}</td><td>{v['tramos']}</td><td>{v['hr']} lpm</td><td>{v['rmssd']:.0f} ms</td><td>{v['pnn50']:.0f} %</td></tr>" for k, v in fase.items())}
</table>
<div class="aviso"><b>Mira el orden.</b> Lo que el reloj llama <b>REM</b> tiene el pulso más bajo (43,8) y el
tono vagal más alto (RMSSD 293, pNN50 80 %). Lo que llama <b>profundo</b> tiene el pulso más alto (46,0) y
menos variabilidad. En la fisiología estándar es al revés: el sueño profundo es el de pulso mínimo y
dominio parasimpático; el REM es irregular y con subidas simpáticas.<br><br>
La lectura más simple: <b>al menos parte de tu sueño profundo real se está etiquetando como REM.</b>
Cautela obligada — son solo 2 tramos por fase dentro de nuestras 2,4 h de solape. No es prueba; es una
señal fuerte que se puede confirmar con más noches.</div>

<h2>4 · Seis años de sueño profundo</h2>
<img src="{img('f8_historico.png')}">
<p class="pie">430 noches. Izquierda: minutos de profundo por noche (las líneas punteadas marcan huecos
sin datos; la mediana móvil se corta ahí en vez de fingir continuidad). Centro: tus tres fases contra los
rangos de referencia. Derecha: cuánto dura tu bloque continuo más largo de profundo.</p>
<div class="card">
<table>
<tr><th>métrica</th><th>tú (mediana de 430 noches)</th><th>referencia adulto</th></tr>
<tr><td>Sueño profundo</td><td>{H['profundo_pct']['mediana']} % · 34 min</td><td>13–23 % · 60–110 min</td></tr>
<tr><td>REM</td><td>{H['rem_pct']['mediana']} %</td><td>20–25 %</td></tr>
<tr><td>Ligero</td><td>67,9 %</td><td>50–60 %</td></tr>
<tr><td>Bloque continuo de profundo</td><td>{F['bloque_profundo_max_mediana_min']} min</td><td>20–40 min</td></tr>
<tr><td>Despertares por hora</td><td>{F['despertares_por_hora']['mediana']}</td><td>hasta ~2</td></tr>
<tr><td>Hora de acostarse</td><td>00:37 (±{H['hora_acostarse_std_h']} h)</td><td>estable, ±1 h</td></tr>
</table>
<p><b>Descarté el artefacto obvio.</b> Podría pensarse que el porcentaje sale bajo por dormir muchas horas
(el profundo se concentra al principio y se "diluye"). No es el caso: en tus datos, dormir más se asocia con
<b>más</b> minutos de profundo, no menos (rho +0,30). El déficit es de minutos absolutos, no de aritmética.</p>
<p><b>Y hay buenas noticias en el histórico:</b> tuviste años claramente mejores — 2020 con 55 min de mediana
y 2022 con 52 — y tu mejor noche registrada llegó a 154 min. Tu fisiología <b>sabe</b> hacer sueño profundo.
Eso apunta a factores modificables (horario, hábitos, carga de entrenamiento, estrés) más que a algo
estructural. La tendencia reciente sí es descendente: {H['profundo_pct']['mediana']} % global frente al 6,1 % de las
últimas 30 noches registradas.</p>
</div>

<h2>5 · Entonces, ¿de qué viene el cansancio?</h2>
<div class="card">
<p>Con lo que hay sobre la mesa, ordenado por cuánta evidencia lo respalda <i>en tus propios datos</i>:</p>
<ul>
<li><b>Horario tardío e irregular (evidencia directa, y es tuyo).</b> Acostarte a la 00:37 con ±{H['hora_acostarse_std_h']} h de
desviación desalinea el reloj biológico, y el sueño profundo es la primera víctima porque depende de la
presión de sueño acumulada y de la fase circadiana. Es la palanca más grande que tienes.</li>
<li><b>Sueño profundo bajo de forma sostenida (evidencia directa, con la reserva del medidor).</b> Aunque el
reloj subestime, 430 noches apuntando al mismo sitio es un patrón, no ruido.</li>
<li><b>Apnea del sueño: poco probable pero no descartable.</b> Argumenta en contra tu baja fragmentación
({F['despertares_por_hora']['mediana']} despertares/h). Argumenta a favor el profundo bajo crónico con cansancio diurno. Solo lo
descarta un estudio de sueño — y si roncas fuerte o alguien te ha visto dejar de respirar, sube al primer puesto.</li>
<li><b>Otras causas que ningún sensor de muñeca ve:</b> déficit de hierro/ferritina, tiroides, vitamina D,
estrés crónico, alcohol o cafeína vespertinos, entrenar intenso de noche. Una analítica básica descarta
las tres primeras en una mañana.</li>
</ul>
</div>
<div class="rojo"><b>Recomendación honesta.</b> Cansancio crónico + seis años de sueño profundo por debajo de
la referencia es motivo suficiente para una consulta médica — no por urgencia, sino porque ya tienes
datos que merecen una lectura profesional y hay causas tratables que ningún reloj puede ver. Lleva estas
cifras: son un punto de partida excelente. <b>Nada de esto es un diagnóstico: rESPira es un dispositivo
experimental y el Galaxy Watch no es un aparato médico.</b></div>

<h2>6 · Lo que podemos medir nosotros a partir de ahora</h2>
<div class="card"><ul>
<li><b>Un clasificador propio de profundidad de sueño.</b> El reloj estima fases con acelerómetro y un PPG
que muestrea de vez en cuando. rESPira tiene <b>cada latido a 100 Hz</b> — materia prima muy superior. La
tabla del punto 3 ya insinúa que nuestras métricas separan estados; con 5-10 noches se puede entrenar
contra el hipnograma del reloj y, donde discrepen, decidir por fisiología en vez de por marketing.</li>
<li><b>El experimento del horario.</b> Dos semanas acostándote a la misma hora (±30 min) y midiendo con
ambos. Es la hipótesis más accionable y la más fácil de probar.</li>
<li><b>Noches completas con la caja negra</b> (ya está en el firmware): sin teléfono, sin pantalla, con el
cinturón sujeto para validar también la respiración dormida.</li>
</ul></div>

<p class="pie" style="margin-top:26px">Fuentes: rESPira (887.653 muestras crudas, latidos re-detectados
offline) y export oficial de Samsung Health (430 noches con estadificación, 2020-2026). Aviso sobre el
export: las carpetas de detalle por minuto del pulso venían vacías, así que la comparación de pulso es
hora a hora. Generado el 10/08/2026.</p>

</main></body></html>"""

p = os.path.join(AQUI, "informe_sueno_reloj.html")
with open(p, "w", encoding="utf-8") as f:
    f.write(html)
print("informe:", p, f"({os.path.getsize(p)/1e6:.1f} MB)")
