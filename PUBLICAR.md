# Cómo subirlo

El repositorio ya existe en GitHub y este local está listo: seis commits a tu
nombre, sin credenciales, sin datos crudos y sin firmas de herramienta.

```bash
git remote add origin https://github.com/javiersoliso/rESPira.git
git push -u origin main
```

Te pedirá autenticación. GitHub no acepta la contraseña de la cuenta: usa un
token personal (Settings → Developer settings → Personal access tokens →
Fine-grained tokens, con permiso de escritura sobre este repositorio) o GitHub
Desktop, que lo maneja por ti.

## Antes de subir, comprueba

```bash
git status          # debe estar limpio
git ls-files | wc -l   # 55 archivos
git grep -i coreana    # no debe devolver nada
```

## Después

- Verifica que el README se vea con el esquema y las seis figuras.
- Pon la descripción y los temas del repositorio: `esp32`, `ppg`, `hrv`,
  `biosignals`, `arduino`, `android`, `heart-rate-variability`, `biofeedback`.
- Destácalo en tu perfil de GitHub y en la sección de proyectos de LinkedIn.

## Lo que quedó fuera a propósito

| Qué | Por qué |
|---|---|
| `firmware/redes.h` | Tus credenciales de wifi |
| Registros de sesión (`.csv`, `.json`) | Mediciones fisiológicas tuyas |
| Figuras 7 y 8 | Son seis años de tu historial de sueño del reloj, no una demostración del instrumento |
| `respira_apk/herramientas/` | Un Android SDK y un JDK17 completos, código ajeno |
| Carpetas `files_v6.x`, `v7`, `v8` | El historial está contado en `docs/HISTORIAL.md` |
| Investigación de ecosistema | Material de negocio, no técnico |
| `.apk` compilado | Se genera; además está firmado con la clave de depuración |

Todo eso sigue en tu disco, en la carpeta original.

## Dos cosas para después

**Firma la aplicación con una clave propia.** Hoy sale firmada con la clave de
depuración, lo que impide publicarla en ninguna tienda y delata que es una
compilación de escritorio. Se genera una vez con `keytool` y se guarda fuera
del repositorio (el `.gitignore` ya excluye `*.keystore` y `*.jks`).

**Publica una versión.** Cuando la firmes, sube el archivo instalable como
*release* de GitHub en lugar de al repositorio: así la gente lo descarga sin
que el archivo binario infle el historial.
