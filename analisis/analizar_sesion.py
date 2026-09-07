#!/usr/bin/env python3
"""
analizar_sesion.py — control de calidad de una sesion de rESPira.

    python3 analizar_sesion.py sesion1.csv sesion2.csv ...

Acepta el CSV viejo (v8, 10 columnas) y el nuevo (v9, 15 columnas + cabecera
'# cfg=...'). Detecta cual es y se adapta.

Saca una tabla comparativa con las metricas que deciden si una sesion sirve:
  PI          indice de perfusion, %.  <0.5 = acoplamiento malo, no insistas
  gate        % del tiempo con señal publicable
  SNR 2f0     2o armonico sobre el ruido, dB.  Es LA prueba de que hay pulso
  CV IBI      dispersion de los intervalos, %.  >25 = deteccion inestable
  R_norm      contraste dedo/aire. Si baja de ~30x, tienes fuga de luz
  sat         % de muestras a fondo de escala.  >0 = el AGC se pasa

Requiere numpy, pandas y scipy.
"""
import sys, os, warnings
import numpy as np, pandas as pd
from scipy import signal
warnings.filterwarnings('ignore')

FULL_DEFAULT = 262143


def leer(path):
    cfg = {}
    with open(path) as f:
        primera = f.readline()
    skip = 0
    if primera.startswith('#'):
        skip = 1
        for kv in primera.lstrip('#').strip().split(';'):
            if '=' in kv:
                k, v = kv.split('=', 1)
                cfg[k.strip()] = v.strip()
    df = pd.read_csv(path, skiprows=skip)
    df.columns = [c.strip() for c in df.columns]
    if 't_ms' not in df.columns:
        raise ValueError(f'{path}: no encuentro la columna t_ms')
    df['t'] = (df.t_ms - df.t_ms.iloc[0]) / 1000.0
    return df, cfg


def bandpass(x, lo, hi, fs, order=3):
    ny = fs / 2
    hi = min(hi, ny * 0.95)
    if lo >= hi:
        return np.zeros_like(x)
    b, a = signal.butter(order, [lo / ny, hi / ny], btype='band')
    return signal.filtfilt(b, a, x)


def metricas(df, cfg, nombre):
    t = df.t.values
    ir = df.ir.values.astype(float)
    led = df.led.values.astype(float) if 'led' in df else np.full(len(ir), np.nan)
    dur = t[-1] - t[0]
    fs = len(t) / dur if dur > 0 else 25.0
    full = FULL_DEFAULT
    if cfg.get('bits') == '16':
        full = 65535

    # --- rejilla uniforme, saltando los huecos de registro ---
    tu = np.arange(0, dur, 1 / fs)
    iru = np.interp(tu, t, ir)
    gap = np.zeros_like(tu, bool)
    dt = np.diff(t)
    for i in np.where(dt > 4 / fs)[0]:
        gap |= (tu > t[i]) & (tu < t[i + 1])

    # --- presencia de dedo: usa la columna del firmware si esta ---
    if 'dedo' in df:
        dedo = np.interp(tu, t, df.dedo.values.astype(float)) > 0.5
    else:
        dedo = iru > np.percentile(iru, 60)
    util = dedo & ~gap

    out = {'sesion': nombre, 'dur_s': round(dur, 1), 'n': len(df),
           'fs_reg': round(fs, 1), 'dedo_%': round(dedo.mean() * 100)}
    out['cfg'] = cfg.get('bits', '?') + 'bit/' + cfg.get('fs_fifo', '?') + 'Hz' if cfg else '(sin cfg)'

    if util.sum() < fs * 20:
        out['aviso'] = 'menos de 20 s con dedo: no evaluable'
        return out

    # excluye tambien las muestras saturadas: durante un recorte del ADC la
    # "amplitud" que se mide es el propio recorte, no el pulso
    satu = np.interp(tu, t, (ir >= full - 8).astype(float)) > 0.5
    util = util & ~satu

    x = iru[util]
    dc = float(np.median(x))
    ac = bandpass(x, 0.7, 3.0, fs)
    out['DC'] = round(dc)
    out['DC_%fondo'] = round(dc / full * 100, 1)

    # PI POR VENTANAS. Un solo percentil global lo dispara cualquier artefacto
    # de movimiento (apoyar el dedo mueve el IR de 1400 a 200000). La mediana
    # de las ventanas de 10 s es inmune a eso y es la cifra que representa la
    # sesion. Se guarda tambien el mejor tramo, que dice de que es capaz el
    # montaje cuando te quedas quieto.
    W = int(fs * 10)
    pis = []
    for i in range(0, len(x) - W + 1, W // 2):
        seg = ac[i:i + W]
        dcw = float(np.median(x[i:i + W]))
        if dcw <= 0:
            continue
        pis.append((np.percentile(seg, 97.5) - np.percentile(seg, 2.5)) / dcw * 100)
    if pis:
        pis = np.array(pis)
        # ninguna perfusion real supera el 10 %: esas ventanas son artefacto de
        # movimiento (apoyar o retirar el dedo) y se descartan para el "mejor"
        limpias = pis[pis < 10.0]
        out['PI_%'] = round(float(np.median(pis)), 3)
        out['PI_mejor_%'] = round(float(np.percentile(limpias, 75)), 3) if len(limpias) else np.nan
        out['PI_vent'] = f'{len(limpias)}/{len(pis)}'
    elif dc > 0:
        acpp = float(np.percentile(ac, 97.5) - np.percentile(ac, 2.5))
        out['PI_%'] = round(acpp / dc * 100, 3)

    # --- SNR del 2o armonico: la prueba de que es un pulso y no ruido ---
    f, P = signal.welch(ac, fs=fs, nperseg=int(min(len(ac), fs * 20)))
    cb = (f >= 0.7) & (f <= 2.2)
    if cb.sum() > 2:
        f0 = f[cb][np.argmax(P[cb])]
        m2 = (f > 2 * f0 - 0.15) & (f < 2 * f0 + 0.15)
        nb = (f > 2 * f0 + 0.4) & (f < min(2 * f0 + 1.4, fs / 2 * 0.9))
        out['bpm_fft'] = round(f0 * 60, 1)
        out['SNR2f0_dB'] = round(10 * np.log10(P[m2].max() / np.median(P[nb])), 1) \
            if (m2.sum() and nb.sum()) else np.nan
    # --- autocorrelacion ---
    z = ac - ac.mean()
    r = np.correlate(z, z, 'full')[len(z) - 1:]
    r /= r[0]
    lg = np.arange(len(r)) / fs
    w = (lg > 0.45) & (lg < 1.6)
    out['autocorr'] = round(float(r[w].max()), 3) if w.sum() else np.nan

    # --- contraste dedo/aire normalizado por corriente ---
    if not np.isnan(led).all():
        rn = ir / np.where(led > 0, led, np.nan)
        d0 = df.dedo.values > 0.5 if 'dedo' in df else np.zeros(len(df), bool)
        if d0.sum() > 50 and (~d0).sum() > 50:
            out['R_dedo'] = round(float(np.nanmedian(rn[d0])))
            out['R_aire'] = round(float(np.nanmedian(rn[~d0])), 1)
            if out['R_aire'] > 0:
                out['contraste'] = round(out['R_dedo'] / out['R_aire'])

    # --- latidos ---
    if 'latido' in df:
        bt = t[df.latido.values == 1]
        if len(bt) > 5:
            ibi = np.diff(bt)
            ok = (ibi > 0.4) & (ibi < 1.8)
            out['latidos_fw'] = int(len(bt))
            out['IBI_ok_%'] = round(ok.mean() * 100)
            if ok.sum() > 3:
                out['bpm_fw'] = round(60 / np.median(ibi[ok]), 1)
                out['CV_IBI_%'] = round(ibi[ok].std() / ibi[ok].mean() * 100)
            tDedo = float((df.dedo.values > 0.5).sum() / fs) if 'dedo' in df else dur
            if tDedo > 0:
                out['latidos/min'] = round(len(bt) / tDedo * 60, 1)

    # --- campos nuevos de v9 ---
    if 'gate' in df:
        out['gate_%'] = round(df.gate.mean() * 100)
    if 'pi_pct' in df and 'dedo' in df:
        m = df.dedo.values > 0.5
        if m.sum():
            out['PI_fw_%'] = round(float(np.median(df.pi_pct.values[m])), 3)
    if 'conf' in df and 'gate' in df:
        m = df.gate.values > 0
        if m.sum():
            out['conf'] = round(float(np.median(df.conf.values[m])))

    out['sat_%'] = round(float((ir >= full - 8).mean() * 100), 2)
    out['dup_%'] = round(float((np.diff(ir) == 0).mean() * 100), 1)

    # --- respiracion ---
    if 'pot_pct' in df:
        p = df.pot_pct.values.astype(float)
        mov = np.abs(np.diff(p)) > 0
        if mov.sum() > 20:
            hasta = t[:-1][mov].max()
            sel = t <= hasta
            ps = signal.savgol_filter(
                pd.Series(p[sel]).rolling(7, center=True, min_periods=1).median().values,
                min(21, (sel.sum() // 2) * 2 + 1), 2)
            rng = ps.max() - ps.min()
            if rng > 20:
                pk, _ = signal.find_peaks(ps, prominence=rng * 0.25, distance=int(fs * 0.8))
                if len(pk) > 1:
                    per = np.diff(t[sel][pk])
                    per = per[(per > 1) & (per < 40)]
                    if len(per):
                        out['rpm'] = round(float(np.median(60 / per)), 1)
                        out['ciclos'] = int(len(per))
                out['pot_rango'] = f'{ps.min():.0f}-{ps.max():.0f}'
            out['pot_util_s'] = round(float(hasta), 1)
    return out


def veredicto(m):
    pi = m.get('PI_%', 0) or 0
    snr = m.get('SNR2f0_dB', 0) or 0
    cv = m.get('CV_IBI_%', 99) or 99
    sat = m.get('sat_%', 0) or 0
    if sat > 0.1:
        return 'DESCARTAR · el ADC se satura, el AGC se pasa'
    if pi < 0.2:
        return 'DESCARTAR · acoplamiento del dedo, recolocalo'
    if pi < 0.5 or snr < 6:
        return 'FLOJA · sirve para tendencias, no para HRV'
    if cv > 25:
        return 'REGULAR · señal buena, deteccion inestable'
    return 'BUENA · usable para HRV y RSA'


def main(paths):
    filas = []
    for p in paths:
        try:
            df, cfg = leer(p)
            m = metricas(df, cfg, os.path.basename(p))
            m['veredicto'] = veredicto(m)
            filas.append(m)
        except Exception as e:
            filas.append({'sesion': os.path.basename(p), 'aviso': f'error: {e}'})

    tabla = pd.DataFrame(filas)
    orden = ['sesion', 'cfg', 'dur_s', 'dedo_%', 'DC', 'DC_%fondo',
             'PI_%', 'PI_mejor_%', 'PI_vent', 'SNR2f0_dB', 'autocorr',
             'bpm_fft', 'bpm_fw', 'CV_IBI_%', 'IBI_ok_%', 'latidos/min',
             'gate_%', 'conf', 'R_dedo', 'R_aire', 'contraste', 'sat_%', 'dup_%',
             'rpm', 'ciclos', 'pot_rango', 'pot_util_s', 'veredicto', 'aviso']
    cols = [c for c in orden if c in tabla.columns]
    tabla = tabla[cols]

    pd.set_option('display.width', 250)
    pd.set_option('display.max_columns', 60)
    print()
    print('=' * 100)
    print('  CONTROL DE CALIDAD DE SESIONES · rESPira')
    print('=' * 100)
    for _, r in tabla.iterrows():
        print(f"\n  {r['sesion']}")
        for c in cols[1:]:
            if c in r and pd.notna(r[c]):
                print(f"      {c:<14} {r[c]}")
    print()
    print('-' * 100)
    print('  REFERENCIAS')
    print('    PI_%        > 0.5 aceptable · > 1.0 bueno · < 0.2 inservible')
    print('    SNR2f0_dB   > 10 hay pulso de verdad · < 6 puede ser ruido filtrado')
    print('    autocorr    > 0.45 periodico · < 0.30 indistinguible de ruido 1/f')
    print('    CV_IBI_%    < 15 bueno · > 25 deteccion inestable')
    print('    contraste   ~60 normal · < 30 hay fuga de luz ambiente')
    print('    sat_%       debe ser 0.00')
    print('    DC_%fondo   objetivo 45-65 %')
    print('-' * 100)

    tabla.to_csv('comparativa_sesiones.csv', index=False)
    print('\n  tabla guardada en comparativa_sesiones.csv\n')
    return tabla


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    main(sys.argv[1:])
