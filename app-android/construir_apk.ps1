<#
    rESPira · MOVIL — instalar herramientas y compilar el APK
    -----------------------------------------------------------------------
    Descarga el SDK de Android y Gradle en una carpeta propia (NO instala nada
    en el sistema ni toca el registro), compila y deja el APK a mano.

    Uso:   powershell -ExecutionPolicy Bypass -File construir_apk.ps1

    Descarga unos 1,5-2 GB la primera vez. Las siguientes son inmediatas.
    Todo queda bajo herramientas\  y se borra con solo borrar esa carpeta.
#>

$ErrorActionPreference = 'Stop'
$raiz  = $PSScriptRoot
$tools = Join-Path $raiz 'herramientas'
$sdk   = Join-Path $tools 'android-sdk'
$gdir  = Join-Path $tools 'gradle'

$CMDLINE_URL = 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip'
$GRADLE_URL  = 'https://services.gradle.org/distributions/gradle-7.6.4-bin.zip'
$GRADLE_DIR  = 'gradle-7.6.4'

function Paso($n, $t) { Write-Host "`n[$n] $t" -ForegroundColor Cyan }

# ---------------------------------------------------------------- 0. Java ---
# Las command-line tools de Android estan compiladas para Java 17. Con un JDK 16
# fallan con "class file version 61.0 ... recognizes up to 60.0". Como no vamos a
# tocar el Java del sistema, si hace falta bajamos un JDK 17 AQUI, en la carpeta
# del proyecto, y lo usamos solo para compilar.
Paso 0 'Comprobando Java (hacen falta 17 o mas)'
New-Item -ItemType Directory -Force -Path $tools | Out-Null

function Version-De($jdkHome) {
    # Se lee el fichero 'release' que trae todo JDK, en vez de ejecutar
    # "java -version": ese comando escribe por el canal de ERRORES, y con
    # ErrorActionPreference en Stop aborta el script entero.
    if (-not $jdkHome) { return 0 }
    if (-not (Test-Path (Join-Path $jdkHome 'bin\javac.exe'))) { return 0 }
    $rel = Join-Path $jdkHome 'release'
    if (Test-Path $rel) {
        $l = Select-String -Path $rel -Pattern 'JAVA_VERSION="?(\d+)' -EA SilentlyContinue
        if ($l) { return [int]$l.Matches[0].Groups[1].Value }
    }
    if ($jdkHome -match 'jdk-?(\d+)') { return [int]$matches[1] }   # por el nombre
    return 0
}

$jdk = $null
$candidatos = @()
if ($env:JAVA_HOME) { $candidatos += $env:JAVA_HOME }
$candidatos += (Get-ChildItem 'C:\Program Files\Java' -Directory -EA SilentlyContinue |
                Select-Object -ExpandProperty FullName)
$candidatos += (Join-Path $tools 'jdk17')
foreach ($c in $candidatos) {
    if ((Version-De $c) -ge 17) { $jdk = $c; break }
}

if (-not $jdk) {
    $destino = Join-Path $tools 'jdk17'
    if (-not (Test-Path (Join-Path $destino 'bin\java.exe'))) {
        Write-Host '    tu Java es anterior al 17; bajando uno solo para esto (~190 MB)...'
        $zip = Join-Path $tools 'jdk17.zip'
        $url = 'https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse'
        Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
        $tmp = Join-Path $tools '_jdktmp'
        Remove-Item $tmp -Recurse -Force -EA SilentlyContinue
        Expand-Archive $zip -DestinationPath $tmp -Force
        # OJO: nada de llamar a esto $raiz — esa variable ya es la carpeta del
        # proyecto, y pisarla hacia que local.properties acabara dentro del JDK.
        $carpetaJdk = Get-ChildItem $tmp -Directory | Select-Object -First 1
        Remove-Item $destino -Recurse -Force -EA SilentlyContinue
        Move-Item $carpetaJdk.FullName $destino -Force
        Remove-Item $tmp, $zip -Recurse -Force -EA SilentlyContinue
    }
    $jdk = $destino
}
$env:JAVA_HOME = $jdk
$env:PATH = (Join-Path $jdk 'bin') + ';' + $env:PATH
Write-Host "    JAVA_HOME = $env:JAVA_HOME  (Java $(Version-De $jdk))"

# ------------------------------------------ 0.5 el motor de analisis ---
# El motor, el informe y el sonido se desarrollan en diseno\ (donde se pueden
# probar en el navegador al instante) y viven dentro del APK. Se copian aqui
# para que nunca haya dos versiones distintas rondando.
Paso '0.5' 'Copiando el motor de analisis a los assets'
$diseno = Join-Path (Split-Path $raiz -Parent) 'diseno'
$assets = Join-Path $raiz 'app\src\main\assets\app'
if (Test-Path $diseno) {
    New-Item -ItemType Directory -Force -Path $assets | Out-Null
    foreach ($f in @('motor.js','informe.js','voces.js','sonido.js','practicas.js')) {
        $o = Join-Path $diseno $f
        if (Test-Path $o) { Copy-Item $o (Join-Path $assets $f) -Force; Write-Host "    $f" }
    }
} else { Write-Host '    (no encuentro diseno\; uso lo que ya hay en assets)' }

# comprobacion de sintaxis: un error aqui daria un APK que compila pero no arranca
$node = Get-Command node -EA SilentlyContinue
if ($node) {
    foreach ($f in (Get-ChildItem $assets -Filter *.js)) {
        & node --check $f.FullName
        if ($LASTEXITCODE -ne 0) { throw "Error de sintaxis en $($f.Name)" }
    }
    Write-Host '    sintaxis del JavaScript: OK'
}

# ------------------------------------------------------- 1. SDK de Android ---
Paso 1 'SDK de Android'
if (-not (Test-Path (Join-Path $sdk 'cmdline-tools\latest\bin\sdkmanager.bat'))) {
    $zip = Join-Path $tools 'cmdline-tools.zip'
    Write-Host '    descargando command-line tools (~130 MB)...'
    Invoke-WebRequest -Uri $CMDLINE_URL -OutFile $zip -UseBasicParsing
    $tmp = Join-Path $tools '_cmdtmp'
    Remove-Item $tmp -Recurse -Force -EA SilentlyContinue
    Expand-Archive $zip -DestinationPath $tmp -Force
    New-Item -ItemType Directory -Force -Path (Join-Path $sdk 'cmdline-tools') | Out-Null
    Move-Item (Join-Path $tmp 'cmdline-tools') (Join-Path $sdk 'cmdline-tools\latest') -Force
    Remove-Item $tmp, $zip -Recurse -Force -EA SilentlyContinue
} else { Write-Host '    ya estaba' }

$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$sdkmgr = Join-Path $sdk 'cmdline-tools\latest\bin\sdkmanager.bat'

Paso 2 'Licencias y paquetes del SDK (~1 GB la primera vez)'
# Un 'y' por cada licencia que pregunte; sobran de largo y no bloquea nada.
$responder = ("y`n" * 50)
$responder | & $sdkmgr --sdk_root="$sdk" --licenses | Out-Null
& $sdkmgr --sdk_root="$sdk" "platform-tools" "platforms;android-33" "build-tools;33.0.2"
if ($LASTEXITCODE -ne 0) { throw "Fallo instalando paquetes del SDK." }

# ------------------------------------------------------------- 3. Gradle ---
Paso 3 'Gradle'
$gbin = Join-Path $gdir "$GRADLE_DIR\bin\gradle.bat"
if (-not (Test-Path $gbin)) {
    $zip = Join-Path $tools 'gradle.zip'
    Write-Host '    descargando Gradle (~120 MB)...'
    Invoke-WebRequest -Uri $GRADLE_URL -OutFile $zip -UseBasicParsing
    Expand-Archive $zip -DestinationPath $gdir -Force
    Remove-Item $zip -Force -EA SilentlyContinue
} else { Write-Host '    ya estaba' }

# --------------------------------------------------------------- 4. local ---
Paso 4 'local.properties'
$sdkEsc = $sdk -replace '\\', '\\\\' -replace ':', '\:'
"sdk.dir=$sdkEsc" | Out-File (Join-Path $raiz 'local.properties') -Encoding ascii

# -------------------------------------------------------------- 5. compilar ---
Paso 5 'Compilando el APK'
Push-Location $raiz
try {
    & $gbin --no-daemon assembleRelease
    if ($LASTEXITCODE -ne 0) { throw "La compilacion fallo." }
} finally { Pop-Location }

# ----------------------------------------------------------------- 6. copia ---
$apk = Get-ChildItem (Join-Path $raiz 'app\build\outputs\apk\release') -Filter *.apk -Recurse |
       Select-Object -First 1
if (-not $apk) { throw "Compilo pero no encuentro el APK." }
$destino = Join-Path $raiz 'rESPira.apk'
Copy-Item $apk.FullName $destino -Force

Write-Host "`n=======================================================" -ForegroundColor Green
Write-Host " APK LISTO" -ForegroundColor Green
Write-Host " $destino"
Write-Host ((" Tamano: {0:N0} KB") -f ((Get-Item $destino).Length / 1KB))
Write-Host "=======================================================" -ForegroundColor Green
Write-Host @"

Para instalarlo en el movil, la via mas simple sin cables:
  1. Copia rESPira.apk al telefono (USB, Bluetooth, Drive, lo que sea).
  2. Abrelo desde el explorador de archivos del telefono.
  3. Android pedira permitir 'instalar apps desconocidas' para esa app: acepta.

Por USB, si prefieres:
  $sdk\platform-tools\adb.exe install -r "$destino"
"@
