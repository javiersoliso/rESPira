# -*- coding: utf-8 -*-
"""Figura del historico de 430 noches del Galaxy Watch."""
import os
import numpy as np, pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

AQUI = os.path.dirname(os.path.abspath(__file__))
n = pd.read_csv(os.path.join(AQUI, "historico_noches.csv"))
n["inicio"] = pd.to_datetime(n["inicio"], utc=True, format="mixed").dt.tz_convert("America/Bogota")
f = pd.read_csv(os.path.join(AQUI, "fragmentacion_noches.csv"))

BG="#0d1219"; SURF="#0f1620"; GRID="#1e2b39"; TX="#e3ecf4"; TX2="#9db0c2"; TX3="#64798d"
PULSO="#199e70"; PULMON="#3987e5"; ORO="#c98500"; MAL="#e66767"
plt.rcParams.update({
    "figure.facecolor": BG, "axes.facecolor": SURF, "savefig.facecolor": BG,
    "axes.edgecolor": GRID, "axes.labelcolor": TX2, "text.color": TX,
    "xtick.color": TX3, "ytick.color": TX3, "grid.color": GRID,
    "axes.grid": True, "grid.linewidth": 0.6, "font.family": "DejaVu Sans",
    "font.size": 10.5, "axes.titlesize": 11.5, "axes.titlecolor": TX2,
    "legend.facecolor": SURF, "legend.edgecolor": GRID, "legend.labelcolor": TX2})

fig, axs = plt.subplots(1, 3, figsize=(12.5, 4.1), gridspec_kw={"wspace": 0.28})

# --- 1: minutos de profundo por noche a lo largo de los años -------------
ax = axs[0]
ax.axhspan(60, 110, color=PULSO, alpha=0.12, lw=0)
ax.text(n["inicio"].min(), 85, " referencia adulto\n 60–110 min", fontsize=8, color=PULSO, va="center")
ax.scatter(n["inicio"], n["profundo_min"], s=9, color=PULMON, alpha=0.45, lw=0)
r = n.set_index("inicio")["profundo_min"].rolling("60D").median()
# corta la linea donde no hubo datos >60 dias: unirlos fingiria continuidad
hueco = r.index.to_series().diff() > pd.Timedelta(days=60)
vals = r.values.astype(float).copy()
vals[hueco.to_numpy()] = np.nan
ax.plot(r.index, vals, color=ORO, lw=2, label="mediana móvil (60 días)")
for x in r.index[hueco.to_numpy()]:
    ax.axvline(x, color=TX3, lw=0.8, ls=":", alpha=0.6)
ax.scatter([n["inicio"].iloc[-1]], [n["profundo_min"].iloc[-1]], s=55, color=MAL, zorder=5)
ax.annotate("09/08\n18 min", (n["inicio"].iloc[-1], n["profundo_min"].iloc[-1]),
            textcoords="offset points", xytext=(-38, 6), fontsize=8, color=MAL)
ax.set_ylabel("sueño profundo (min/noche)")
ax.set_title("6 años de sueño profundo")
ax.legend(fontsize=8, loc="upper right")
ax.set_ylim(0, 160)

# --- 2: distribucion de las fases ----------------------------------------
ax = axs[1]
datos = [n["profundo_pct"], n["rem_pct"], n["ligero_pct"]]
etiq = ["profundo", "REM", "ligero"]
refs = [(13, 23), (20, 25), (50, 60)]
cols = [PULMON, ORO, TX3]
for i, (d, (lo, hi), c) in enumerate(zip(datos, refs, cols)):
    ax.fill_between([i-0.42, i+0.42], lo, hi, color=PULSO, alpha=0.14, lw=0)
    bp = ax.boxplot(d, positions=[i], widths=0.5, patch_artist=True,
                    showfliers=False, medianprops=dict(color=TX, lw=2))
    bp["boxes"][0].set(facecolor=c, alpha=0.5, edgecolor=c)
    for w in bp["whiskers"] + bp["caps"]: w.set(color=c)
    ax.scatter([i], [datos[i].iloc[-1]], s=45, color=MAL, zorder=5)
ax.set_xticks(range(3)); ax.set_xticklabels(etiq)
ax.set_ylabel("% del sueño")
ax.set_title("sus 430 noches vs referencia (verde)")
ax.text(0.98, 0.90, "punto rojo = noche del 09/08", transform=ax.transAxes,
        ha="right", va="top", fontsize=8, color=MAL)
ax.set_ylim(0, 100)

# --- 3: bloque mas largo de profundo -------------------------------------
ax = axs[2]
ax.hist(f["tramo_profundo_max"], bins=28, color=PULMON, alpha=0.75)
ax.axvline(20, color=PULSO, lw=2, ls="--")
ax.text(21, ax.get_ylim()[1]*0.9, " un ciclo NREM sano\n da bloques de 20–40 min",
        fontsize=8, color=PULSO, va="top")
ax.axvline(f["tramo_profundo_max"].median(), color=ORO, lw=2)
ax.text(f["tramo_profundo_max"].median()-1, ax.get_ylim()[1]*0.55,
        f"su mediana\n{f['tramo_profundo_max'].median():.0f} min ", fontsize=8, color=ORO, ha="right")
ax.set_xlabel("bloque más largo de profundo (min)")
ax.set_ylabel("noches")
ax.set_title("¿llega a bloques largos?")

p = os.path.join(AQUI, "f8_historico.png")
fig.savefig(p, dpi=150, bbox_inches="tight")
print("figura: f8_historico.png")
