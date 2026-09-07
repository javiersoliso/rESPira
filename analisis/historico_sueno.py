# -*- coding: utf-8 -*-
"""Histórico de fases de sueño del Galaxy Watch: ¿el profundo bajo es un
patrón estable o es del algoritmo? Y ¿cambia con el horario?"""
import os, json
import numpy as np, pandas as pd
from datetime import timezone, timedelta

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
st = st.dropna(subset=["fase"])

# una "noche" = un sleep_id
g = st.groupby("sleep_id")
filas = []
for sid, d in g:
    tot = d["min"].sum()
    if tot < 180:            # descarta siestas
        continue
    dd = d.groupby("fase")["min"].sum()
    dormido = tot - dd.get("despierto", 0)
    if dormido < 120:
        continue
    filas.append({
        "fecha": d["ini"].min().date(),
        "inicio": d["ini"].min(),
        "fin": d["fin"].max(),
        "total_h": tot / 60,
        "profundo_pct": 100 * dd.get("profundo", 0) / dormido,
        "rem_pct": 100 * dd.get("REM", 0) / dormido,
        "ligero_pct": 100 * dd.get("ligero", 0) / dormido,
        "profundo_min": dd.get("profundo", 0),
        "rem_min": dd.get("REM", 0),
    })
n = pd.DataFrame(filas).sort_values("inicio").reset_index(drop=True)
print(f"noches con estadificacion: {len(n)}")
print(f"rango: {n['inicio'].min():%d/%m/%Y} -> {n['inicio'].max():%d/%m/%Y}\n")

print("ULTIMAS 12 NOCHES")
print(f"{'fecha':>12} {'acostado':>9} {'horas':>6} {'profundo':>9} {'REM':>7} {'ligero':>7}")
for _, r in n.tail(12).iterrows():
    print(f"{r['fecha']!s:>12} {r['inicio']:%H:%M}    {r['total_h']:5.1f}h "
          f"{r['profundo_pct']:7.1f}% {r['rem_pct']:6.1f}% {r['ligero_pct']:6.1f}%")

print("\nESTADISTICA DE TODAS LAS NOCHES")
for c, ref in [("profundo_pct", "referencia adulto: 13-23 %"),
               ("rem_pct", "referencia adulto: 20-25 %"),
               ("ligero_pct", "referencia adulto: 50-60 %")]:
    v = n[c]
    print(f"  {c:14s} mediana {v.median():5.1f} %  (p10 {v.quantile(.1):4.1f} · "
          f"p90 {v.quantile(.9):4.1f})   {ref}")
print(f"  noches con profundo < 5 %: {(n['profundo_pct'] < 5).sum()} de {len(n)} "
      f"({100*(n['profundo_pct'] < 5).mean():.0f} %)")
print(f"  noches con profundo > 13 %: {(n['profundo_pct'] > 13).sum()} de {len(n)}")
print(f"  mejor noche de profundo: {n.loc[n['profundo_pct'].idxmax(), 'fecha']} "
      f"con {n['profundo_pct'].max():.1f} % ({n['profundo_min'].max():.0f} min)")

# ¿el % de profundo depende de la hora de acostarse?
n["hora_ac"] = n["inicio"].dt.hour + n["inicio"].dt.minute/60
n["hora_ac"] = n["hora_ac"].where(n["hora_ac"] > 12, n["hora_ac"] + 24)   # madrugada
temprano = n[n["hora_ac"] <= 23.5]; tarde = n[n["hora_ac"] > 23.5]
print(f"\n  acostandose ANTES de 23:30 ({len(temprano)} noches): "
      f"profundo {temprano['profundo_pct'].median():.1f} % · REM {temprano['rem_pct'].median():.1f} %")
print(f"  acostandose DESPUES de 23:30 ({len(tarde)} noches): "
      f"profundo {tarde['profundo_pct'].median():.1f} % · REM {tarde['rem_pct'].median():.1f} %")
if len(temprano) > 5 and len(tarde) > 5:
    from scipy import stats
    u = stats.mannwhitneyu(temprano["profundo_pct"], tarde["profundo_pct"])
    print(f"  (Mann-Whitney p = {u.pvalue:.3f})")

# regularidad: desviacion de la hora de acostarse
print(f"\n  hora de acostarse: mediana {int(n['hora_ac'].median()%24)}:"
      f"{int((n['hora_ac'].median()%1)*60):02d} · "
      f"desviacion {n['hora_ac'].std():.1f} h  (irregularidad del horario)")
ult30 = n.tail(30)
print(f"  ultimas 30 noches: desviacion {ult30['hora_ac'].std():.1f} h · "
      f"profundo mediana {ult30['profundo_pct'].median():.1f} %")

with open(os.path.join(AQUI, "historico_sueno.json"), "w", encoding="utf-8") as f:
    json.dump({
        "noches": len(n),
        "rango": [str(n["inicio"].min().date()), str(n["inicio"].max().date())],
        "profundo_pct": {"mediana": round(float(n["profundo_pct"].median()), 1),
                         "p10": round(float(n["profundo_pct"].quantile(.1)), 1),
                         "p90": round(float(n["profundo_pct"].quantile(.9)), 1),
                         "max": round(float(n["profundo_pct"].max()), 1)},
        "rem_pct": {"mediana": round(float(n["rem_pct"].median()), 1)},
        "noches_profundo_bajo_5pct": int((n["profundo_pct"] < 5).sum()),
        "hora_acostarse_std_h": round(float(n["hora_ac"].std()), 1),
    }, f, ensure_ascii=False, indent=1)
n.to_csv(os.path.join(AQUI, "historico_noches.csv"), index=False)
print("\nhistorico_sueno.json + historico_noches.csv escritos")
