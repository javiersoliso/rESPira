# -*- coding: utf-8 -*-
"""
Cruce de la noche 09-10/08/2026: Samsung Galaxy Watch  x  rESPira
 - hipnograma del reloj con horas exactas (stage 40001 despierto, 40002 ligero,
   40003 profundo, 40004 REM; horas en UTC + time_offset)
 - pulso del reloj (filas + binning por minuto de los json)
 - pulso rESPira re-detectado (1 min) en el tramo 23:02-01:27
Salidas: veredictos por consola + f7_reloj.png + cruce_reloj.json
"""
import os, json, glob
import numpy as np
import pandas as pd
from datetime import datetime, timezone, timedelta
from scipy import signal as sg

AQUI = os.path.dirname(os.path.abspath(__file__))
# Carpeta del export de Samsung Health. El nombre que genera la aplicacion
# lleva dentro el identificador de la cuenta, asi que se resuelve por patron
# en vez de escribirlo aqui. Colocar el export descomprimido en analisis/datos/.
import glob
_BASE = os.environ.get("RESPIRA_EXPORT") or os.path.join(AQUI, "datos", "samsung_health")
_cand = sorted(glob.glob(os.path.join(_BASE, "samsunghealth_*", "samsunghealth_*")))
DEXP = _cand[0] if _cand else _BASE
# Sesion de rESPira a cruzar con el reloj. Se pasa por linea de comandos:
#     python cruzar_reloj.py ruta/a/mi_sesion.csv
import sys
RESCATE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(AQUI, "datos", "sesion.csv")
TZ = timezone(timedelta(hours=-5))

def csv_samsung(nombre):
    return pd.read_csv(os.path.join(DEXP, nombre), skiprows=1, index_col=False,
                       low_memory=False)

# ------------------------------------------------------------ fases reloj ---
st = csv_samsung("com.samsung.health.sleep_stage.20260810100963.csv")
st["ini"] = pd.to_datetime(st["start_time"], utc=True).dt.tz_convert(TZ)
st["fin"] = pd.to_datetime(st["end_time"], utc=True).dt.tz_convert(TZ)
n0 = datetime(2026, 8, 9, 22, 0, tzinfo=TZ)
n1 = datetime(2026, 8, 10, 8, 30, tzinfo=TZ)
st = st[(st["ini"] >= n0) & (st["fin"] <= n1)].sort_values("ini").reset_index(drop=True)
NOM = {40001: "despierto", 40002: "ligero", 40003: "profundo", 40004: "REM"}
st["nombre"] = st["stage"].map(NOM)
print("fases de la noche:", len(st))
tot = st.groupby("nombre").apply(
    lambda g: (g["fin"] - g["ini"]).sum().total_seconds() / 60, include_groups=False)
print("totales del reloj (min) — deben cuadrar con la captura (35/274/18/169):")
print(tot.round(0).to_string())

# ------------------------------------------------------------ pulso reloj ---
# OJO: este export NO trae el detalle por minuto — las carpetas
# jsons/...heart_rate/ vienen VACIAS aunque el CSV las referencia. Lo que hay
# son resumenes POR HORA con media, minimo y maximo (las barras grises de la
# app). Con eso se compara a nivel de hora, no de minuto.
hr = csv_samsung("com.samsung.shealth.tracker.heart_rate.20260810100963.csv")
col = {c.split(".")[-1]: c for c in hr.columns}
hr["ini"] = pd.to_datetime(hr[col["start_time"]], utc=True).dt.tz_convert(TZ)
hr = hr[(hr["ini"] >= n0) & (hr["ini"] <= n1)].sort_values("ini").reset_index(drop=True)
hr["media"] = hr[col["heart_rate"]].astype(float)
hr["lo"] = hr[col["min"]].astype(float)
hr["hi"] = hr[col["max"]].astype(float)
# las medidas puntuales (una lectura suelta) traen min=max=0: no son rango
hr.loc[hr["lo"] <= 0, "lo"] = np.nan
hr.loc[hr["hi"] <= 0, "hi"] = np.nan
t_w = np.array([t.timestamp() for t in hr["ini"]])
hr_w = hr["media"].to_numpy()
lo_w = hr["lo"].to_numpy(); hi_w = hr["hi"].to_numpy()
print(f"\npulso del reloj: {len(hr)} registros entre {hr['ini'].iloc[0]:%H:%M} y {hr['ini'].iloc[-1]:%H:%M}")
print("  (el export no incluye el detalle por minuto: solo resumenes horarios)")
kmin = int(np.nanargmin(lo_w))
vmin = float(np.nanmin(lo_w))
print(f"minimo del reloj: {vmin:.0f} lpm en la hora de las {hr['ini'].iloc[kmin]:%H:%M}")
print("\nresumen horario del reloj (media [min-max]):")
for _, r in hr.iterrows():
    rango = "medida suelta" if not np.isfinite(r["lo"]) else f"[{r['lo']:.0f}-{r['hi']:.0f}]"
    print(f"  {r['ini']:%H:%M}  {r['media']:.0f}  {rango}")
print(f"  --> rESPira dejo de grabar a la 01:27; el minimo de {vmin:.0f} lpm cae "
      f"a las {hr['ini'].iloc[kmin]:%H:%M}, fuera de nuestro alcance")

# --------------------------------------------------------- pulso rESPira ---
df = pd.read_csv(RESCATE, skiprows=1)
sid = df.groupby("sid").size().idxmax()
g = df[df["sid"] == sid].dropna(subset=["ir"]).reset_index(drop=True)
t_raw = g["t_ms"].to_numpy(np.float64) / 1000.0; t_raw -= t_raw[0]
ir = g["ir"].to_numpy(np.float64)
dt = np.diff(t_raw)
corte = np.where((dt > 1.5) | (dt < -1.0))[0]
bordes = np.concatenate([[0], corte + 1, [len(t_raw)]])
lat = []
for a, b in zip(bordes[:-1], bordes[1:]):
    if b - a < 3000: continue
    fs = (b - a - 1) / max(t_raw[b-1] - t_raw[a], 1e-9)
    if not (80 < fs < 130): fs = 106.7
    tt = t_raw[a] + np.arange(b - a) / fs
    y = ir[a:b]
    b_, a_ = sg.butter(3, [0.5/(fs/2), 3.5/(fs/2)], "bandpass")
    yf = sg.filtfilt(b_, a_, y)
    nblo = int(20*fs); nb = max(1, len(yf)//nblo)
    esc = np.array([np.median(np.abs(yf[i*nblo:(i+1)*nblo]))+1e-6 for i in range(nb)])
    esc_i = np.repeat(esc, nblo)[:len(yf)]
    if len(esc_i) < len(yf): esc_i = np.concatenate([esc_i, np.full(len(yf)-len(esc_i), esc[-1])])
    picos, _ = sg.find_peaks(-(yf/esc_i), distance=int(0.33*fs), prominence=1.6)
    lat.extend(tt[picos])
lat = np.sort(np.array(lat))
ibi = np.diff(lat); tibi = lat[1:]
ok = (ibi > 0.4) & (ibi < 2.2)
med = pd.Series(ibi).rolling(9, center=True, min_periods=3).median().to_numpy()
ok &= np.abs(ibi - med) / med < 0.30
t0_abs = sid / 1000.0
mins_r, hr_r = [], []
for m0 in np.arange(0, tibi[-1], 60.0):
    m = ok & (tibi >= m0) & (tibi < m0 + 60)
    if m.sum() >= 10:
        mins_r.append(t0_abs + m0 + 30)
        hr_r.append(60.0 / np.median(ibi[m]))
mins_r = np.array(mins_r); hr_r = np.array(hr_r)

# --------------------------------------------- acuerdo reloj vs rESPira ----
# Comparacion HORA A HORA: el reloj solo da un valor por hora, asi que se
# compara su media horaria con la mediana de rESPira en esa misma hora.
horas = []
for _, r in hr.iterrows():
    h0 = r["ini"].timestamp(); h1 = h0 + 3600
    m = (mins_r >= h0) & (mins_r < h1)
    if m.sum() >= 20:            # al menos 20 min de rESPira en esa hora
        horas.append((f"{r['ini']:%H:%M}", float(np.median(hr_r[m])),
                      float(r["media"]), float(r["lo"]), float(r["hi"]),
                      float(np.min(hr_r[m])), int(m.sum())))
print("\nHORA A HORA  (rESPira mediana | reloj media [min-max] | rESPira minimo):")
difs = []
for h, rr, rw, lo, hi, rmin, n in horas:
    print(f"  {h}   rESPira {rr:5.1f}   reloj {rw:5.1f} [{lo:.0f}-{hi:.0f}]"
          f"   dif {rr-rw:+5.1f}   (rESPira min {rmin:.0f}, {n} min)")
    difs.append(rr - rw)
mae = float(np.mean(np.abs(difs))) if difs else float("nan")
sesgo = float(np.mean(difs)) if difs else float("nan")
print(f"  --> MAE {mae:.1f} lpm · sesgo {sesgo:+.1f} lpm ({len(difs)} horas)")

# ----------------------------------- veredictos sobre nuestras ventanas ----
def fase_en(h0, h1):
    a = datetime(2026, 8, 10, h0//60, h0%60, tzinfo=TZ)
    b = datetime(2026, 8, 10, h1//60, h1%60, tzinfo=TZ)
    sel = st[(st["fin"] > a) & (st["ini"] < b)]
    d = {}
    for _, r in sel.iterrows():
        dur = (min(r["fin"], b) - max(r["ini"], a)).total_seconds()/60
        d[r["nombre"]] = d.get(r["nombre"], 0) + dur
    return d

v1 = fase_en(9, 67)        # 00:09-01:07  nuestro tramo agitado
v2 = fase_en(75, 87)       # 01:15-01:27  nuestro "mas profundo"
print("\nque dice el reloj de NUESTRO tramo agitado (00:09-01:07):")
for k, v in sorted(v1.items(), key=lambda x: -x[1]): print(f"  {k}: {v:.0f} min")
print("y de nuestro tramo 'mas profundo' (01:15-01:27):")
for k, v in sorted(v2.items(), key=lambda x: -x[1]): print(f"  {k}: {v:.0f} min")

prof = st[st["nombre"] == "profundo"]
print("\nlos tramos de PROFUNDO del reloj:")
for _, r in prof.iterrows():
    print(f"  {r['ini']:%H:%M} - {r['fin']:%H:%M}  ({(r['fin']-r['ini']).total_seconds()/60:.0f} min)")

# ---------------------------------------------- LA PRUEBA DE FUEGO --------
# 23:04-23:16 es terreno CONOCIDO: rESPira registro respiracion deliberada
# a 3-7 rpm con retenciones a pulmon lleno de hasta 18 s. Estaba DESPIERTO,
# sin discusion. ¿Que dice el reloj de esos minutos?
def fase_entre(a, b):
    sel = st[(st["fin"] > a) & (st["ini"] < b)]
    d = {}
    for _, r in sel.iterrows():
        dur = (min(r["fin"], b) - max(r["ini"], a)).total_seconds()/60
        d[r["nombre"]] = d.get(r["nombre"], 0) + dur
    return d
a_ej = datetime(2026, 8, 9, 23, 4, tzinfo=TZ)
b_ej = datetime(2026, 8, 9, 23, 16, tzinfo=TZ)
ejercicio = fase_entre(a_ej, b_ej)
# --------------------------------------------------------------------------
# LO QUE MAS NOS INTERESA: que media rESPira dentro de cada fase del reloj.
# Si nuestras metricas separan las fases que el reloj etiqueta, tenemos la
# semilla de un clasificador propio (con IBIs latido a latido, no muneca).
def metricas_en(a, b):
    """HR, RMSSD y pNN50 de rESPira entre dos instantes locales."""
    ta = a.timestamp() - t0_abs; tb = b.timestamp() - t0_abs
    m = ok & (tibi >= ta) & (tibi < tb)
    if m.sum() < 40:
        return None
    x = ibi[m] * 1000.0
    # solo pares de latidos consecutivos aceptados
    par = ok[1:] & ok[:-1]
    mp = par & (tibi[1:] >= ta) & (tibi[1:] < tb)
    dif = (ibi[1:] - ibi[:-1])[mp] * 1000.0
    if len(dif) < 30:
        return None
    return {"n": int(m.sum()), "hr": 60000.0/np.mean(x),
            "rmssd": float(np.sqrt(np.mean(dif**2))),
            "pnn50": float(100*np.mean(np.abs(dif) > 50)),
            "sdnn": float(np.std(x))}

print("\n=== rESPira DENTRO de cada fase que etiqueto el reloj ===")
acum = {}
for _, r in st.iterrows():
    if r["ini"].timestamp() - t0_abs > tibi[-1]:
        continue
    mm = metricas_en(r["ini"], r["fin"])
    if mm:
        acum.setdefault(r["nombre"], []).append(mm)
resumen_fases = {}
for nombre in ["despierto", "ligero", "profundo", "REM"]:
    v = acum.get(nombre, [])
    if not v:
        print(f"  {nombre}: sin tramos solapados con rESPira")
        continue
    resumen_fases[nombre] = {
        "tramos": len(v),
        "hr": round(float(np.median([x["hr"] for x in v])), 1),
        "rmssd": round(float(np.median([x["rmssd"] for x in v])), 0),
        "pnn50": round(float(np.median([x["pnn50"] for x in v])), 0),
    }
    d = resumen_fases[nombre]
    print(f"  {nombre:10s} ({d['tramos']:2d} tramos):  HR {d['hr']:5.1f} lpm"
          f" · RMSSD {d['rmssd']:4.0f} ms · pNN50 {d['pnn50']:3.0f} %")
print("\n*** PRUEBA DE FUEGO: 23:04-23:16, DESPIERTO haciendo respiracion")
print("    (retenciones a pulmon lleno de 4-18 s registradas por el cinturon)")
print("    el reloj clasifico esos minutos como:")
for k, v in sorted(ejercicio.items(), key=lambda x: -x[1]):
    print(f"      {k}: {v:.0f} min")
print(f"    inicio de sueno segun el reloj: {st['ini'].iloc[0]:%H:%M}")
print(f"    (rESPira: aun despierto y respirando a 3-7 rpm a esa hora)")

# ================================================================= figura ===
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates

BG="#0d1219"; SURF="#0f1620"; GRID="#1e2b39"; TX="#e3ecf4"; TX2="#9db0c2"; TX3="#64798d"
PULSO="#199e70"; PULMON="#3987e5"; ORO="#c98500"; MAL="#e66767"
plt.rcParams.update({
    "figure.facecolor": BG, "axes.facecolor": SURF, "savefig.facecolor": BG,
    "axes.edgecolor": GRID, "axes.labelcolor": TX2, "text.color": TX,
    "xtick.color": TX3, "ytick.color": TX3, "grid.color": GRID,
    "axes.grid": True, "grid.linewidth": 0.6, "font.family": "DejaVu Sans",
    "font.size": 10.5, "axes.titlesize": 11.5, "axes.titlecolor": TX2,
    "legend.facecolor": SURF, "legend.edgecolor": GRID, "legend.labelcolor": TX2})

C = {"despierto": MAL, "REM": ORO, "ligero": TX3, "profundo": PULMON}
NIV = {"despierto": 3, "REM": 2, "ligero": 1, "profundo": 0}

fig, axs = plt.subplots(2, 1, figsize=(11.5, 6.6), sharex=True,
                        gridspec_kw={"height_ratios": [1, 1.25], "hspace": 0.12})
ax = axs[0]
for _, r in st.iterrows():
    y = NIV[r["nombre"]]
    ax.fill_between([r["ini"], r["fin"]], y, y + 0.86,
                    color=C[r["nombre"]], lw=0, alpha=0.9 if r["nombre"] != "ligero" else 0.55)
ax.set_yticks([v + 0.43 for v in NIV.values()])
ax.set_yticklabels(list(NIV.keys()))
ax.set_ylim(-0.2, 4.1)
ax.set_title("hipnograma del Galaxy Watch · noche 09-10/08 (fases con hora local)")
# nuestras ventanas
for a, b, txt, yy in [
        (datetime(2026,8,9,23,4,tzinfo=TZ), datetime(2026,8,9,23,16,tzinfo=TZ),
         "DESPIERTO (respiración + retenciones)", 4.48),
        (datetime(2026,8,10,0,9,tzinfo=TZ), datetime(2026,8,10,1,7,tzinfo=TZ),
         "rESPira: pulso agitado", 4.05),
        (datetime(2026,8,10,1,15,tzinfo=TZ), datetime(2026,8,10,1,27,tzinfo=TZ),
         "perfil profundo", 3.62)]:
    ax.axvspan(a, b, color=TX, alpha=0.07, lw=0)
    ax.annotate(txt, (a, yy), fontsize=7.8, color=TX2, va="top")
ax.set_ylim(-0.2, 4.75)

ax = axs[1]
tw_dt = [datetime.fromtimestamp(t, tz=TZ) for t in t_w]
# el reloj solo da un valor por hora, con su rango min-max: se dibuja como
# barra de rango + punto, no como linea continua (seria inventar resolucion)
for x, m, lo, hi in zip(tw_dt, hr_w, lo_w, hi_w):
    ax.plot([x, x], [lo, hi], color=TX3, lw=6, alpha=0.35, solid_capstyle="round")
ax.plot(tw_dt, hr_w, "o", ms=6, color=TX2, label="reloj: media horaria (barra = min-max)")
ax.plot([datetime.fromtimestamp(t, tz=TZ) for t in mins_r], hr_r,
        color=PULSO, lw=1.8, label="rESPira: mediana por minuto (dedo)")
ax.scatter([tw_dt[kmin]], [vmin], s=45, color=MAL, zorder=5)
ax.annotate(f"minimo del reloj: {vmin:.0f} lpm", (tw_dt[kmin], vmin),
            textcoords="offset points", xytext=(8, -13), fontsize=8.5, color=MAL)
ax.set_ylabel("pulso (lpm)")
ax.legend(fontsize=8.5, loc="upper left")
ax.xaxis.set_major_formatter(mdates.DateFormatter("%H:%M", tz=TZ))
ax.set_xlabel("hora local")
p = os.path.join(AQUI, "f7_reloj.png")
fig.savefig(p, dpi=150, bbox_inches="tight"); plt.close(fig)
print("\nfigura: f7_reloj.png")

with open(os.path.join(AQUI, "cruce_reloj.json"), "w", encoding="utf-8") as f:
    json.dump({
        "aviso": "el export no incluye el detalle por minuto del pulso "
                 "(carpetas jsons/heart_rate vacias): solo resumenes horarios",
        "totales_min": {k: round(float(v)) for k, v in tot.items()},
        "min_reloj": [vmin, f"{hr['ini'].iloc[kmin]:%H:%M}"],
        "acuerdo_horario": {"horas": len(difs), "mae_lpm": round(mae, 1),
                            "sesgo_lpm": round(sesgo, 1),
                            "detalle": [[h, round(rr, 1), round(rw, 1)] for h, rr, rw, *_ in horas]},
        "sueno_inicio_reloj": f"{st['ini'].iloc[0]:%H:%M}",
        "ejercicio_2304_2316_segun_reloj": {k: round(v) for k, v in ejercicio.items()},
        "respira_por_fase_del_reloj": resumen_fases,
        "tramo_agitado_00_09__01_07": {k: round(v) for k, v in v1.items()},
        "tramo_profundo_01_15__01_27": {k: round(v) for k, v in v2.items()},
        "tramos_profundo_reloj": [[f"{r['ini']:%H:%M}", f"{r['fin']:%H:%M}"] for _, r in prof.iterrows()],
    }, f, ensure_ascii=False, indent=1)
print("cruce_reloj.json escrito")
