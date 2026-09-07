# -*- coding: utf-8 -*-
"""
rESPira · analisis de la sesion nocturna (hipnagogia) del 09/08/2026
Entrada : el CSV de rescate (todas las sesiones, columna sid)
Salidas : figuras PNG + resultados.json en esta carpeta
"""
import json
import os
import numpy as np
import pandas as pd
from datetime import datetime, timezone, timedelta
from scipy import signal as sg
from scipy.interpolate import interp1d

# La sesion a analizar se pasa por linea de comandos:
#     python analizar_noche.py ruta/a/mi_sesion.csv
# Los registros propios no se publican; ver AVISO.md.
import sys
RUTA = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "datos", "sesion.csv")
AQUI = os.path.dirname(os.path.abspath(__file__))
TZ = timezone(timedelta(hours=-5))

# ---------------------------------------------------------------- estilo ---
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

BG   = "#0d1219"; SURF = "#0f1620"; GRID = "#1e2b39"
TX   = "#e3ecf4"; TX2  = "#9db0c2"; TX3 = "#64798d"
PULSO = "#199e70"; PULMON = "#3987e5"; ORO = "#c98500"
MAL = "#e66767"; OJO = "#e0a34a"
plt.rcParams.update({
    "figure.facecolor": BG, "axes.facecolor": SURF, "savefig.facecolor": BG,
    "axes.edgecolor": GRID, "axes.labelcolor": TX2, "text.color": TX,
    "xtick.color": TX3, "ytick.color": TX3, "grid.color": GRID,
    "axes.grid": True, "grid.linewidth": 0.6, "axes.linewidth": 0.8,
    "font.family": "DejaVu Sans", "font.size": 10.5,
    "axes.titlesize": 11.5, "axes.titlecolor": TX2,
    "legend.facecolor": SURF, "legend.edgecolor": GRID, "legend.labelcolor": TX2,
})

def guardar(fig, nombre):
    p = os.path.join(AQUI, nombre)
    fig.savefig(p, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print("figura:", nombre)

# ================================================================= carga ===
df = pd.read_csv(RUTA, skiprows=1)
sid = df.groupby("sid").size().idxmax()
g = df[df["sid"] == sid].reset_index(drop=True)
ini_local = datetime.fromtimestamp(sid / 1000, tz=TZ)
nan_ir = int(g["ir"].isna().sum())
g = g.dropna(subset=["ir"]).reset_index(drop=True)
print(f"sesion {sid} ({ini_local:%d/%m %H:%M}), filas {len(g)}, ir NaN quitados {nan_ir}")

t_raw = g["t_ms"].to_numpy(np.float64) / 1000.0
t_raw = t_raw - t_raw[0]
ir    = g["ir"].to_numpy(np.float64)
pot   = g["pot_pct"].to_numpy(np.float64)
pi    = g["pi_pct"].to_numpy(np.float64)
rn    = g["r_norm"].to_numpy(np.float64)
led   = g["led"].to_numpy(np.float64)
bpm_fw = g["bpm_mediana"].to_numpy(np.float64)
DUR = t_raw[-1]

# ------------------------------------------------ segmentos contiguos ------
# El reloj por lotes mete jitter (retrocesos de decenas de ms). Dentro de un
# segmento sin huecos se asume muestreo uniforme y el tiempo se reconstruye.
dt = np.diff(t_raw)
corte = np.where((dt > 1.5) | (dt < -1.0))[0]
bordes = np.concatenate([[0], corte + 1, [len(t_raw)]])
segs = []
for a, b in zip(bordes[:-1], bordes[1:]):
    if b - a < 500:                       # <5 s no aporta
        continue
    fs = (b - a - 1) / max(t_raw[b-1] - t_raw[a], 1e-9)
    if not (80 < fs < 130):
        fs = 106.7
    tt = t_raw[a] + np.arange(b - a) / fs
    segs.append({"a": a, "b": b, "fs": fs, "t": tt})
print(f"segmentos: {len(segs)}  (cubren {sum(s['b']-s['a'] for s in segs)/len(t_raw)*100:.1f} % de filas)")

huecos = [(t_raw[i], dt[i]) for i in np.where(dt > 2.0)[0]]

# ==================================================== latidos (offline) ====
lat_t, lat_amp = [], []
for s in segs:
    y = ir[s["a"]:s["b"]].copy()
    fs = s["fs"]
    if len(y) < int(10 * fs):
        continue
    b_, a_ = sg.butter(3, [0.5 / (fs / 2), 3.5 / (fs / 2)], "bandpass")
    yf = sg.filtfilt(b_, a_, y)
    # escala local robusta (bloques de 20 s) para normalizar la prominencia
    nblo = int(20 * fs)
    nb = max(1, len(yf) // nblo)
    esc = np.array([np.median(np.abs(yf[i*nblo:(i+1)*nblo])) + 1e-6 for i in range(nb)])
    esc_i = np.repeat(esc, nblo)[:len(yf)]
    if len(esc_i) < len(yf):
        esc_i = np.concatenate([esc_i, np.full(len(yf)-len(esc_i), esc[-1])])
    yn = yf / esc_i
    picos, props = sg.find_peaks(-yn, distance=int(0.33 * fs), prominence=1.6)
    for p in picos:
        lat_t.append(s["t"][p])
        lat_amp.append(-yf[p])
lat_t = np.array(lat_t); lat_amp = np.array(lat_amp)
orden = np.argsort(lat_t); lat_t = lat_t[orden]; lat_amp = lat_amp[orden]
print(f"latidos offline: {len(lat_t)}  (firmware anoto {int(g['latido'].sum())})")

# ------------------------------------------------------- IBIs validados ----
ibi = np.diff(lat_t)
t_ibi = lat_t[1:]
val = (ibi > 0.4) & (ibi < 2.2)
med7 = pd.Series(ibi).rolling(9, center=True, min_periods=3).median().to_numpy()
val &= np.abs(ibi - med7) / med7 < 0.30
print(f"IBIs validos: {val.sum()} de {len(ibi)}  ({100*val.mean():.1f} %)")
tv, iv = t_ibi[val], ibi[val]
# pares ADYACENTES de verdad (latidos consecutivos, ninguno descartado en
# medio): solo con ellos se puede hacer RMSSD/pNN50 sin inflarlos
par = val[1:] & val[:-1]
dif_ady = (ibi[1:] - ibi[:-1])[par] * 1000.0
t_par = t_ibi[1:][par]

# HR por minuto (mediana de IBIs del minuto)
mins = np.arange(0, DUR, 60.0)
hr_min = np.full(len(mins), np.nan)
for k, m0 in enumerate(mins):
    m = (tv >= m0) & (tv < m0 + 60)
    if m.sum() >= 10:
        hr_min[k] = 60.0 / np.median(iv[m])

# ------------------------------------------------- HRV por ventanas 5 min --
VENT = 300.0
v0s = np.arange(0, DUR - VENT, 60.0)          # paso 1 min, ventana 5 min
hrv = {"t": [], "hr": [], "sdnn": [], "rmssd": [], "pnn50": [], "lf": [], "hf": [], "lfhf": [], "rr_rsa": [], "rsa_amp": [], "cob": [], "f_lenta": []}
for v0 in v0s:
    m = (tv >= v0) & (tv < v0 + VENT)
    n = m.sum()
    if n < 150:
        continue
    x_t, x_i = tv[m], iv[m] * 1000.0
    mp = (t_par >= v0) & (t_par < v0 + VENT)
    dif = dif_ady[mp]
    cob = float(np.sum(x_i) / 1000.0 / VENT)          # fraccion de tiempo cubierta
    hrv["cob"].append(cob)
    hrv["t"].append(v0 + VENT / 2)
    hrv["hr"].append(60000.0 / np.mean(x_i))
    hrv["sdnn"].append(np.std(x_i))
    hrv["rmssd"].append(np.sqrt(np.mean(dif ** 2)) if len(dif) > 30 else np.nan)
    hrv["pnn50"].append(100.0 * np.mean(np.abs(dif) > 50) if len(dif) > 30 else np.nan)
    # espectro del tacograma (4 Hz)
    try:
        f_i = interp1d(x_t, x_i, kind="linear", bounds_error=False,
                       fill_value=(x_i[0], x_i[-1]))
        tt4 = np.arange(x_t[0], x_t[-1], 0.25)
        y4 = sg.detrend(f_i(tt4))
        fr, pw = sg.welch(y4, fs=4.0, nperseg=min(512, len(y4)))
        lf = np.trapezoid(pw[(fr >= 0.04) & (fr < 0.15)], fr[(fr >= 0.04) & (fr < 0.15)])
        hf = np.trapezoid(pw[(fr >= 0.15) & (fr < 0.40)], fr[(fr >= 0.15) & (fr < 0.40)])
        hrv["lf"].append(lf); hrv["hf"].append(hf)
        hrv["lfhf"].append(lf / hf if hf > 0 else np.nan)
        # Respiracion desde el tacograma: pico en 0.10-0.45 Hz (6-27 rpm).
        # Por debajo de ~6 rpm la respiracion comparte banda con las ondas
        # de Mayer y no se pueden separar sin el cinturon: se reporta aparte
        # como "oscilacion lenta" (f_lenta).
        band = (fr >= 0.10) & (fr <= 0.45)
        lenta = (fr >= 0.05) & (fr < 0.10)
        hrv["f_lenta"].append(float(fr[lenta][np.argmax(pw[lenta])] * 60.0) if lenta.any() else np.nan)
        if band.any() and pw[band].max() > 0:
            fpico = fr[band][np.argmax(pw[band])]
            hrv["rr_rsa"].append(fpico * 60.0)
            # amplitud de la oscilacion RSA en esa banda (ms)
            bb, ab = sg.butter(2, [max(fpico-0.06,0.06)/2.0, min(fpico+0.06,0.6)/2.0], "bandpass")
            osc = sg.filtfilt(bb, ab, y4)
            hrv["rsa_amp"].append(float(np.percentile(np.abs(osc), 90) * 2))
        else:
            hrv["rr_rsa"].append(np.nan); hrv["rsa_amp"].append(np.nan)
    except Exception:
        for k in ["lf", "hf", "lfhf", "rr_rsa", "rsa_amp", "f_lenta"]:
            hrv[k].append(np.nan)
hrv = {k: np.array(v, dtype=float) for k, v in hrv.items()}
print(f"ventanas HRV: {len(hrv['t'])}")

# ================================================== potenciometro ==========
# suavizado y deteccion de respiraciones mientras estuvo puesto
t_all = np.concatenate([s["t"] for s in segs])
pot_all = np.concatenate([pot[s["a"]:s["b"]] for s in segs])
# rejilla uniforme 10 Hz para el pot
t10 = np.arange(0, DUR, 0.1)
pot10 = interp1d(t_all, pot_all, bounds_error=False, fill_value=np.nan)(t10)
potf = np.array(pd.Series(pot10).rolling(9, center=True, min_periods=1).median().to_numpy(), dtype=np.float64)
b2, a2 = sg.butter(2, 0.7 / 5.0, "low")
ok10 = ~np.isnan(potf)
potf[ok10] = sg.filtfilt(b2, a2, potf[ok10]) if ok10.sum() > 30 else potf[ok10]

# cuando se solto: ultima ventana de 30 s con recorrido > 3 puntos
recorrido = pd.Series(potf).rolling(300).apply(lambda v: np.nanmax(v) - np.nanmin(v), raw=True).to_numpy()
vivas = np.where(recorrido > 3.0)[0]
t_soltado = t10[vivas[-1]] if len(vivas) else 0.0
print(f"pot util hasta el minuto {t_soltado/60:.1f}")

# respiraciones sobre el pot vivo
mvivo = t10 <= t_soltado
resp_t, resp_rpm, resp_prof = [], [], []
if mvivo.sum() > 600:
    pv = potf[mvivo]; tvv = t10[mvivo]
    picos, _ = sg.find_peaks(pv, distance=15, prominence=2.5)   # >=1.5 s, >=2.5 pts
    for i in range(1, len(picos)):
        per = tvv[picos[i]] - tvv[picos[i-1]]
        if 1.5 < per < 30:
            resp_t.append(tvv[picos[i]])
            resp_rpm.append(60.0 / per)
            seg_v = pv[picos[i-1]:picos[i]]
            resp_prof.append(float(pv[picos[i]] - seg_v.min()))
    # pausas (holds): tramos con derivada casi nula y pot alto o bajo
print(f"respiraciones detectadas en el pot: {len(resp_t)}")

# holds: tramos >4 s con |d pot/dt| < 0.8 %/s dentro del tramo vivo
holds = []
if mvivo.sum() > 600:
    dp = np.abs(np.gradient(potf[mvivo], 0.1))
    quieto = dp < 0.8
    cambios = np.diff(quieto.astype(int))
    inis = np.where(cambios == 1)[0]; fins = np.where(cambios == -1)[0]
    if quieto[0]: inis = np.r_[0, inis]
    if quieto[-1]: fins = np.r_[fins, len(quieto)-1]
    for i0, i1 in zip(inis, fins):
        d = (i1 - i0) * 0.1
        if d >= 4.0:
            holds.append((t10[mvivo][i0], d, float(np.nanmean(potf[mvivo][i0:i1]))))
print(f"pausas/holds >4 s con el pot puesto: {len(holds)}")

# ------------------------------------- validacion RSA vs pot (rpm a rpm) ---
# El estimador compara contra el cinturon donde este daba >= 6 rpm (por
# debajo, respiracion y ondas de Mayer comparten banda: alli se compara
# contra la "oscilacion lenta").
val_rsa, val_lenta = [], []
for v0 in np.arange(60, t_soltado - 120, 60.0):
    m = (np.array(resp_t) >= v0) & (np.array(resp_t) < v0 + 120) if resp_t else np.array([])
    if not len(m) or m.sum() < 4:
        continue
    rpm_pot = float(np.median(np.array(resp_rpm)[m]))
    k = int(np.argmin(np.abs(hrv["t"] - (v0 + 60))))
    if abs(hrv["t"][k] - (v0 + 60)) > 90:
        continue
    if rpm_pot >= 6.0 and np.isfinite(hrv["rr_rsa"][k]):
        val_rsa.append((v0 + 60, rpm_pot, float(hrv["rr_rsa"][k])))
    elif rpm_pot < 6.0 and np.isfinite(hrv["f_lenta"][k]):
        val_lenta.append((v0 + 60, rpm_pot, float(hrv["f_lenta"][k])))
val_rsa = np.array(val_rsa); val_lenta = np.array(val_lenta)
if len(val_rsa):
    err = np.abs(val_rsa[:, 1] - val_rsa[:, 2])
    print(f"validacion RSA vs pot (>=6 rpm): {len(val_rsa)} ventanas, MAE {err.mean():.2f} rpm, mediana {np.median(err):.2f}")
if len(val_lenta):
    errl = np.abs(val_lenta[:, 1] - val_lenta[:, 2])
    print(f"validacion oscilacion lenta (<6 rpm): {len(val_lenta)} ventanas, MAE {errl.mean():.2f} rpm, mediana {np.median(errl):.2f}")

# PI y r_norm por 5 min
pi_v, rn_v, tpv = [], [], []
for v0 in np.arange(0, DUR - VENT, 60.0):
    m = (t_all >= v0) & (t_all < v0 + VENT)
    if m.sum() > 1000:
        tpv.append(v0 + VENT/2)
        pp = pi[np.concatenate([np.arange(s["a"], s["b"]) for s in segs])][m]
        rr_ = rn[np.concatenate([np.arange(s["a"], s["b"]) for s in segs])][m]
        pi_v.append(np.nanmedian(pp)); rn_v.append(np.nanmedian(rr_))
pi_v = np.array(pi_v); rn_v = np.array(rn_v); tpv = np.array(tpv)

# indice de movimiento por minuto: fraccion de muestra con artefacto grosero
mov_min = np.full(len(mins), np.nan)
idx_all = np.concatenate([np.arange(s["a"], s["b"]) for s in segs])
amp_col = g["amp"].to_numpy(np.float64)[idx_all]
for k, m0 in enumerate(mins):
    m = (t_all >= m0) & (t_all < m0 + 60)
    if m.sum() > 500:
        a = amp_col[m]
        mov_min[k] = np.mean(a > np.nanmedian(amp_col) * 6)

# =============================================================== resumen ===
def fase_stats(m0, m1, nombre):
    m = (np.array(hrv["t"]) >= m0*60) & (np.array(hrv["t"]) < m1*60)
    if not m.any(): return None
    return {
        "fase": nombre, "min": [m0, m1],
        "hr": float(np.nanmedian(hrv["hr"][m])),
        "sdnn": float(np.nanmedian(hrv["sdnn"][m])),
        "rmssd": float(np.nanmedian(hrv["rmssd"][m])),
        "pnn50": float(np.nanmedian(hrv["pnn50"][m])),
        "lfhf": float(np.nanmedian(hrv["lfhf"][m])),
        "rr_rsa": float(np.nanmedian(hrv["rr_rsa"][m])),
        "rsa_amp": float(np.nanmedian(hrv["rsa_amp"][m])),
        "f_lenta": float(np.nanmedian(hrv["f_lenta"][m])),
        "cob": float(np.nanmedian(hrv["cob"][m])),
    }

res = {
    "sesion": {"sid": int(sid), "inicio_local": f"{ini_local:%d/%m/%Y %H:%M:%S}",
               "dur_min": round(DUR/60, 1), "filas": int(len(g)), "ir_nan": nan_ir,
               "gate_pct": round(100*g["gate"].mean(), 1),
               "huecos": [[round(a/60,1), round(d,1)] for a, d in huecos]},
    "latidos": {"offline": int(len(lat_t)), "firmware": int(g['latido'].sum()),
                "ibi_validos": int(val.sum()), "cobertura_pct": round(100*val.mean(),1)},
    "pot": {"util_hasta_min": round(t_soltado/60, 1), "respiraciones": len(resp_t),
            "holds": [[round(a/60,2), round(d,1), round(v,0)] for a, d, v in holds][:40]},
    "validacion_rsa": {"ventanas": int(len(val_rsa)),
                       "mae_rpm": round(float(np.abs(val_rsa[:,1]-val_rsa[:,2]).mean()), 2) if len(val_rsa) else None,
                       "detalle": val_rsa.round(2).tolist() if len(val_rsa) else []},
    "validacion_lenta": {"ventanas": int(len(val_lenta)),
                         "mae_rpm": round(float(np.abs(val_lenta[:,1]-val_lenta[:,2]).mean()), 2) if len(val_lenta) else None,
                         "detalle": val_lenta.round(2).tolist() if len(val_lenta) else []},
}
print(json.dumps(res["latidos"], indent=1))

# fases ajustadas tras ver las curvas: ejercicio con retenciones 2-16,
# hipnagogia 16-29, recolocacion 29-33, sueno estable 33-67, tramo de
# perfusion baja 67-125, despertar parcial ~127, sueno final 133-145
for f in [fase_stats(2, 16, "despierto: ejercicio con retenciones"),
          fase_stats(16, 29, "hipnagogia (quedandose dormido)"),
          fase_stats(33, 67, "sueno estable"),
          fase_stats(67, 125, "sueno con perfusion baja (mano/postura)"),
          fase_stats(125, 133, "despertar parcial"),
          fase_stats(133, 145, "sueno final (el mas profundo)")]:
    if f: res.setdefault("fases", []).append(f)

with open(os.path.join(AQUI, "resultados.json"), "w", encoding="utf-8") as fjs:
    json.dump(res, fjs, ensure_ascii=False, indent=1)
print("resultados.json escrito")

# ================================================================ figuras ===
MINX = np.array(mins)/60.0

# --- F1: linea temporal maestra --------------------------------------------
fig, axs = plt.subplots(4, 1, figsize=(11, 9.2), sharex=True,
                        gridspec_kw={"height_ratios": [1.2, 1, 0.8, 0.55], "hspace": 0.16})
ax = axs[0]
ax.plot(MINX, hr_min, color=PULSO, lw=1.8)
ax.set_ylabel("pulso (lpm)")
ax.set_title(f"rESPira · noche del {ini_local:%d/%m} — inicio {ini_local:%H:%M} · pulso por minuto (re-detectado offline)")
ax = axs[1]
if len(resp_t):
    ax.plot(np.array(resp_t)/60.0, resp_rpm, ".", ms=3.5, color=PULMON, label="cinturon (real)")
mrsa = np.isfinite(hrv["rr_rsa"]) & (hrv["cob"] > 0.5)
ax.plot(hrv["t"][mrsa]/60.0, hrv["rr_rsa"][mrsa], color=ORO, lw=1.8, label="estimada del pulso (6-27 rpm)")
mlen = np.isfinite(hrv["f_lenta"]) & (hrv["cob"] > 0.5)
ax.plot(hrv["t"][mlen]/60.0, hrv["f_lenta"][mlen], color=TX3, lw=1.2, ls=":",
        label="oscilacion lenta (resp. lenta / Mayer)")
ax.axvline(t_soltado/60, color=TX3, lw=1, ls="--")
ax.text(t_soltado/60+0.6, 27.5, "cinturon suelto", color=TX3, fontsize=8.5, va="top")
ax.set_ylabel("respiracion (rpm)"); ax.set_ylim(0, 30)
ax.legend(loc="upper right", fontsize=8, ncols=3)
ax = axs[2]
ax.plot(tpv/60.0, pi_v, color=PULSO, lw=1.8)
ax.set_ylabel("perfusion PI (%)")
ax = axs[3]
ax.plot(MINX, mov_min, color=OJO, lw=1.4)
for a, d in huecos:
    ax.axvspan(a/60, (a+d)/60, color=MAL, alpha=0.35, lw=0)
ax.set_ylabel("artefactos")
ax.set_xlabel("minutos desde el inicio (23:02)")
ax.text(0.995, 0.86, "bandas rojas = huecos de datos", transform=ax.transAxes,
        ha="right", fontsize=8.5, color=MAL)
guardar(fig, "f1_linea_temporal.png")

# --- F2: zoom a quedarse dormido -------------------------------------------
fig, axs = plt.subplots(3, 1, figsize=(11, 7), sharex=True,
                        gridspec_kw={"hspace": 0.15})
mz = MINX <= 45
axs[0].plot(MINX[mz], hr_min[mz], color=PULSO, lw=2)
axs[0].set_ylabel("pulso (lpm)")
axs[0].set_title("quedarse dormido: minutos 0-45")
mz10 = t10/60 <= 45
axs[1].plot(t10[mz10]/60, potf[mz10], color=PULMON, lw=1.2)
axs[1].set_ylabel("pulmon (pot %)")
mzr = (hrv["t"]/60 <= 45) & np.isfinite(hrv["rsa_amp"])
axs[2].plot(hrv["t"][mzr]/60, hrv["rsa_amp"][mzr], color=ORO, lw=1.8)
axs[2].set_ylabel("oscilacion RSA (ms)")
axs[2].set_xlabel("minutos")
guardar(fig, "f2_dormirse.png")

# --- F3: validacion RSA vs cinturon ----------------------------------------
if len(val_rsa) >= 3 or len(val_lenta) >= 2:
    fig, axs = plt.subplots(1, 2, figsize=(11, 4.2), gridspec_kw={"width_ratios": [1.6, 1]})
    # tramo ejemplo: mejor ventana de respiracion LENTA (el caso resonancia);
    # si no hubiera, la mejor de respiracion normal
    if len(val_lenta):
        kb = int(np.argmin(np.abs(val_lenta[:,1] - val_lenta[:,2])))
        c0 = val_lenta[kb, 0] - 60
    else:
        kb = int(np.argmin(np.abs(val_rsa[:,1] - val_rsa[:,2])))
        c0 = val_rsa[kb, 0] - 60
    mseg = (t10 >= c0) & (t10 <= c0 + 120)
    pz = potf[mseg]; pz = (pz - np.nanmean(pz)) / (np.nanstd(pz) + 1e-9)
    axs[0].plot(t10[mseg]-c0, pz, color=PULMON, lw=1.6, label="cinturon (normalizado)")
    mib = (tv >= c0 - 5) & (tv <= c0 + 125)
    if mib.sum() > 8:
        f_i = interp1d(tv[mib], iv[mib]*1000, bounds_error=False, fill_value="extrapolate")
        tt4 = np.arange(c0, c0+120, 0.25)
        y4 = sg.detrend(f_i(tt4))
        bb, ab = sg.butter(2, [0.04/2.0, 0.5/2.0], "bandpass")
        osc = sg.filtfilt(bb, ab, y4)
        oz = (osc - osc.mean()) / (osc.std() + 1e-9)
        axs[0].plot(tt4-c0, oz, color=ORO, lw=1.6, label="oscilacion del IBI (RSA)")
    axs[0].set_xlabel("segundos"); axs[0].set_ylabel("z")
    axs[0].set_title(f"el pulso 'respira': tramo min {c0/60:.0f}-{c0/60+2:.0f}")
    axs[0].legend(fontsize=8.5)
    if len(val_rsa):
        axs[1].scatter(val_rsa[:,1], val_rsa[:,2], s=26, color=ORO,
                       edgecolors=BG, zorder=3, label="resp. normal (>=6 rpm)")
    if len(val_lenta):
        axs[1].scatter(val_lenta[:,1], val_lenta[:,2], s=30, color=PULMON,
                       edgecolors=BG, zorder=3, label="resp. lenta (<6 rpm)")
    lim = [0, 20]
    axs[1].plot(lim, lim, color=TX3, lw=1, ls="--")
    axs[1].set_xlim(lim); axs[1].set_ylim(lim)
    axs[1].set_xlabel("cinturon (rpm)"); axs[1].set_ylabel("estimada del pulso (rpm)")
    axs[1].set_title("rpm: estimada vs real")
    axs[1].legend(fontsize=8)
    guardar(fig, "f3_validacion.png")

# --- F4: HRV ---------------------------------------------------------------
fig, axs = plt.subplots(2, 1, figsize=(11, 6), sharex=True, gridspec_kw={"hspace": 0.15})
mok = hrv["cob"] > 0.5
axs[0].plot(np.where(mok, hrv["t"], np.nan)/60, np.where(mok, hrv["rmssd"], np.nan), color=PULSO, lw=1.8, label="RMSSD")
axs[0].plot(np.where(mok, hrv["t"], np.nan)/60, np.where(mok, hrv["sdnn"], np.nan), color=PULMON, lw=1.8, label="SDNN")
axs[0].set_ylabel("ms"); axs[0].legend(fontsize=8.5)
axs[0].set_title("variabilidad (ventanas de 5 min)")
axs[1].plot(hrv["t"]/60, hrv["lfhf"], color=ORO, lw=1.8)
axs[1].set_ylabel("LF/HF"); axs[1].set_xlabel("minutos")
guardar(fig, "f4_hrv.png")

# --- F5: Poincare ----------------------------------------------------------
fig, ax = plt.subplots(figsize=(6.4, 6))
x_par = ibi[:-1][par] * 1000; y_par = ibi[1:][par] * 1000
def poincare(m0, m1, color, etiqueta):
    m = (t_par >= m0*60) & (t_par < m1*60)
    ax.scatter(x_par[m], y_par[m], s=5, alpha=0.35, color=color, label=etiqueta, lw=0)
poincare(2, 16, PULMON, "despierto (min 2-16)")
poincare(33, 67, PULSO, "dormido (min 33-67)")
ax.set_xlabel("IBI n (ms)"); ax.set_ylabel("IBI n+1 (ms)")
ax.set_title("Poincare: despierto vs dormido")
ax.legend(fontsize=9); ax.set_aspect("equal")
guardar(fig, "f5_poincare.png")

# --- F6: tacograma entero --------------------------------------------------
fig, ax = plt.subplots(figsize=(11, 3.6))
m = np.diff(tv, prepend=tv[0]) < 5
ax.plot(tv/60, iv*1000, color=PULSO, lw=0.7)
for a, d in huecos:
    ax.axvspan(a/60, (a+d)/60, color=MAL, alpha=0.3, lw=0)
ax.set_xlabel("minutos"); ax.set_ylabel("IBI (ms)")
ax.set_title("tacograma completo (cada punto, un latido)")
guardar(fig, "f6_tacograma.png")

print("LISTO")
