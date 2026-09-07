# -*- coding: utf-8 -*-
"""¿Cual es su pulso minimo nocturno historico? ¿El 34 de anoche fue raro?"""
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

hr = pd.read_csv(os.path.join(DEXP, "com.samsung.shealth.tracker.heart_rate.20260810100963.csv"),
                 skiprows=1, index_col=False, low_memory=False)
col = {c.split(".")[-1]: c for c in hr.columns}
hr["t"] = pd.to_datetime(hr[col["start_time"]], utc=True).dt.tz_convert(TZ)
hr["media"] = hr[col["heart_rate"]].astype(float)
hr["lo"] = hr[col["min"]].astype(float)
hr["hi"] = hr[col["max"]].astype(float)
hr.loc[hr["lo"] <= 0, "lo"] = np.nan          # medidas sueltas: min=max=0

# ventana nocturna 23:00-07:00; la "noche" se fecha por el dia en que empezo
h = hr["t"].dt.hour
noc = hr[(h >= 23) | (h < 7)].copy()
noc["noche"] = (noc["t"] - pd.Timedelta(hours=7)).dt.date
g = noc.groupby("noche").agg(minimo=("lo", "min"), media=("media", "mean"),
                             n=("media", "size"))
g = g[(g["n"] >= 4) & g["minimo"].notna()]
print(f"noches con datos nocturnos suficientes: {len(g)}")
print(f"rango: {g.index.min()} -> {g.index.max()}\n")

print("=== PULSO MINIMO NOCTURNO ===")
print(f"  mediana de los minimos: {g['minimo'].median():.0f} lpm")
print(f"  p10 {g['minimo'].quantile(.10):.0f} · p25 {g['minimo'].quantile(.25):.0f} · "
      f"p75 {g['minimo'].quantile(.75):.0f} · p90 {g['minimo'].quantile(.90):.0f}")
print(f"  el mas bajo de todos: {g['minimo'].min():.0f} lpm "
      f"(noche del {g['minimo'].idxmin()})")
print(f"  media nocturna tipica: {g['media'].median():.0f} lpm")

for u in [30, 34, 38, 40, 45]:
    c = (g["minimo"] <= u).sum()
    print(f"  noches con minimo <= {u}: {c:4d} de {len(g)}  ({100*c/len(g):4.1f} %)")

anoche = g.loc[g.index.max()]
print(f"\n=== la noche del 09/08/2026 ===")
print(f"  minimo {anoche['minimo']:.0f} lpm -> percentil "
      f"{100*(g['minimo'] < anoche['minimo']).mean():.0f} de sus noches")
print(f"  (o sea: {100*(g['minimo'] <= anoche['minimo']).mean():.0f} % de sus noches "
      f"bajaron igual o mas)")

print("\n=== por año ===")
gg = g.copy(); gg["anio"] = pd.to_datetime(gg.index).year
for a, d in gg.groupby("anio"):
    print(f"  {a}: {len(d):3d} noches · minimo mediana {d['minimo'].median():.0f} lpm "
          f"· el mas bajo {d['minimo'].min():.0f}")

with open(os.path.join(AQUI, "minimos_nocturnos.json"), "w", encoding="utf-8") as f:
    json.dump({"noches": len(g),
               "minimo_mediana": float(g["minimo"].median()),
               "minimo_absoluto": [float(g["minimo"].min()), str(g["minimo"].idxmin())],
               "p10": float(g["minimo"].quantile(.10)),
               "pct_noches_bajo_34": round(100*float((g["minimo"] <= 34).mean()), 1),
               "media_nocturna_mediana": float(g["media"].median())}, f, indent=1)
print("\nminimos_nocturnos.json escrito")
