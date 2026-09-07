# -*- coding: utf-8 -*-
"""Fragmentacion del sueño: despertares breves por hora, y su relacion con el
sueño profundo. Es la firma que distingue 'poco profundo' de 'sueño roto'."""
import os, json
import numpy as np, pandas as pd
from datetime import timezone, timedelta
from scipy import stats

AQUI = os.path.dirname(os.path.abspath(__file__))
# Carpeta del export de Samsung Health. El nombre que genera la aplicacion
# lleva dentro el identificador de la cuenta, asi que se resuelve por patron
# en vez de escribirlo aqui. Colocar el export descomprimido en analisis/datos/.
import glob
_BASE = os.environ.get("RESPIRA_EXPORT") or os.path.join(AQUI, "datos", "samsung_health")
_cand = sorted(glob.glob(os.path.join(_BASE, "samsunghealth_*", "samsunghealth_*")))
DEXP = _cand[0] if _cand else _BASE
TZ = timezone(timedelta(hours=-5))

st = pd.read_csv(os.path.join(DEXP, "com.samsung.health.sleep_stage.20260810100963.csv"),
                 skiprows=1, index_col=False, low_memory=False)
st["ini"] = pd.to_datetime(st["start_time"], utc=True).dt.tz_convert(TZ)
st["fin"] = pd.to_datetime(st["end_time"], utc=True).dt.tz_convert(TZ)
st["min"] = (st["fin"] - st["ini"]).dt.total_seconds() / 60
NOM = {40001: "despierto", 40002: "ligero", 40003: "profundo", 40004: "REM"}
st["fase"] = st["stage"].map(NOM)
st = st.dropna(subset=["fase"]).sort_values("ini")

filas = []
for sid, d in st.groupby("sleep_id"):
    d = d.sort_values("ini")
    tot = d["min"].sum()
    if tot < 180: continue
    dd = d.groupby("fase")["min"].sum()
    dormido = tot - dd.get("despierto", 0)
    if dormido < 120: continue
    desp = d[d["fase"] == "despierto"]
    # despertares que NO son el primero ni el ultimo tramo (esos son
    # acostarse/levantarse, no fragmentacion)
    interior = desp[(desp["ini"] > d["ini"].min() + pd.Timedelta(minutes=10)) &
                    (desp["fin"] < d["fin"].max() - pd.Timedelta(minutes=10))]
    filas.append({
        "fecha": d["ini"].min().date(),
        "inicio_h": d["ini"].min().hour + d["ini"].min().minute/60,
        "dormido_h": dormido/60,
        "profundo_min": dd.get("profundo", 0),
        "profundo_pct": 100*dd.get("profundo", 0)/dormido,
        "rem_pct": 100*dd.get("REM", 0)/dormido,
        "despertares": len(interior),
        "desp_por_hora": len(interior)/(dormido/60),
        "desp_min": interior["min"].sum(),
        "tramo_profundo_max": d[d["fase"]=="profundo"]["min"].max() if (d["fase"]=="profundo").any() else 0,
    })
n = pd.DataFrame(filas).sort_values("fecha").reset_index(drop=True)

print(f"noches analizadas: {len(n)}\n")
print("=== FRAGMENTACION ===")
print(f"  despertares por noche: mediana {n['despertares'].median():.0f} "
      f"(p10 {n['despertares'].quantile(.1):.0f} · p90 {n['despertares'].quantile(.9):.0f})")
print(f"  despertares POR HORA:  mediana {n['desp_por_hora'].median():.1f} "
      f"(p90 {n['desp_por_hora'].quantile(.9):.1f})")
print("  referencia: hasta ~2/h se considera normal; >5/h es sueño fragmentado")
print(f"  noches con >5 despertares/h: {(n['desp_por_hora']>5).sum()} de {len(n)} "
      f"({100*(n['desp_por_hora']>5).mean():.0f} %)")
print(f"  tiempo despierto dentro de la noche: mediana {n['desp_min'].median():.0f} min")

print("\n=== ¿los despertares se comen el sueño profundo? ===")
r = stats.spearmanr(n["desp_por_hora"], n["profundo_pct"])
print(f"  despertares/h  vs  profundo %:  rho {r.statistic:+.2f} (p {r.pvalue:.1e})")
pocos = n[n["desp_por_hora"] <= n["desp_por_hora"].median()]
muchos = n[n["desp_por_hora"] > n["desp_por_hora"].median()]
print(f"    noches con POCOS despertares: profundo {pocos['profundo_pct'].median():.1f} % "
      f"({pocos['profundo_min'].median():.0f} min)")
print(f"    noches con MUCHOS despertares: profundo {muchos['profundo_pct'].median():.1f} % "
      f"({muchos['profundo_min'].median():.0f} min)")

print("\n=== duracion del tramo mas largo de profundo ===")
print(f"  mediana {n['tramo_profundo_max'].median():.0f} min · p90 {n['tramo_profundo_max'].quantile(.9):.0f} min")
print("  (un ciclo NREM sano da bloques de 20-40 min seguidos)")
print(f"  noches con algun bloque >=20 min: {(n['tramo_profundo_max']>=20).sum()} de {len(n)}")

print("\n=== la noche del 09/08/2026 ===")
u = n.iloc[-1]
print(f"  despertares: {u['despertares']:.0f} en {u['dormido_h']:.1f} h "
      f"= {u['desp_por_hora']:.1f}/h  (percentil {100*(n['desp_por_hora']<u['desp_por_hora']).mean():.0f})")
print(f"  bloque de profundo mas largo: {u['tramo_profundo_max']:.0f} min")

with open(os.path.join(AQUI, "fragmentacion.json"), "w", encoding="utf-8") as f:
    json.dump({
        "noches": len(n),
        "despertares_por_hora": {"mediana": round(float(n["desp_por_hora"].median()), 1),
                                 "p90": round(float(n["desp_por_hora"].quantile(.9)), 1)},
        "pct_noches_muy_fragmentadas": round(100*float((n["desp_por_hora"]>5).mean())),
        "correlacion_despertares_profundo": round(float(r.statistic), 2),
        "bloque_profundo_max_mediana_min": round(float(n["tramo_profundo_max"].median())),
        "noche_0908": {"desp_por_hora": round(float(u["desp_por_hora"]), 1),
                       "bloque_profundo_max": round(float(u["tramo_profundo_max"]))},
    }, f, ensure_ascii=False, indent=1)
n.to_csv(os.path.join(AQUI, "fragmentacion_noches.csv"), index=False)
print("\nfragmentacion.json + fragmentacion_noches.csv escritos")
