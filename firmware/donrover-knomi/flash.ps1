# Instala el firmware de Don Rover en una placa conectada por USB (Windows).
#
#   powershell -ExecutionPolicy Bypass -File .\flash.ps1                      # KNOMI v1
#   powershell -ExecutionPolicy Bypass -File .\flash.ps1 -Board esp32c3-mini  # otra placa
#   powershell -ExecutionPolicy Bypass -File .\flash.ps1 -Port COM5           # elegir el puerto
#
# Placas: knomi · esp32c3-round · esp32-devkit · esp32c3-mini · esp32s3-n16r8
# Necesita Python 3 (https://www.python.org/downloads/). Usa la imagen del repositorio
# (public/firmware/donrover-<placa>.bin) o, si no está, la descarga de la plataforma publicada.
param([string]$Board = "knomi", [string]$Port = "", [int]$Baud = 460800)
$ErrorActionPreference = "Stop"

$valid = @("knomi", "esp32c3-round", "esp32-devkit", "esp32c3-mini", "esp32s3-n16r8")
if ($valid -notcontains $Board) { Write-Host "Placa desconocida: $Board. Opciones: $($valid -join ', ')" -ForegroundColor Red; exit 1 }

$py = if (Get-Command py -ErrorAction SilentlyContinue) { "py" } elseif (Get-Command python -ErrorAction SilentlyContinue) { "python" } else { $null }
if (-not $py) { Write-Host "Falta Python 3: instálalo desde https://www.python.org/downloads/ (marca 'Add python.exe to PATH')." -ForegroundColor Red; exit 1 }

$bin = Join-Path $PSScriptRoot "..\..\public\firmware\donrover-$Board.bin"
if (-not (Test-Path $bin)) {
  $bin = Join-Path $env:TEMP "donrover-$Board.bin"
  Write-Host "Descargando el firmware ($Board)…"
  Invoke-WebRequest "https://tallerdedonrover.vercel.app/firmware/donrover-$Board.bin" -OutFile $bin
}

Write-Host "Instalando esptool (herramienta oficial de Espressif)…"
& $py -m pip install --quiet --upgrade esptool

# Sin --chip: esptool reconoce solo el ESP32, ESP32-C3 o ESP32-S3.
$cmd = @("-m", "esptool", "--baud", "$Baud")
if ($Port) { $cmd += @("--port", $Port) }
$cmd += @("write_flash", "-z", "0x0", $bin)
Write-Host "Instalando Don Rover ($Board)… (si no conecta: mantén presionado BOOT, desconecta y vuelve a conectar el cable)"
& $py @cmd
if ($LASTEXITCODE -ne 0) {
  Write-Host "Reintentando más lento (115200)…" -ForegroundColor Yellow
  $cmd[3] = "115200"
  & $py @cmd
}
if ($LASTEXITCODE -eq 0) { Write-Host "¡Listo! Abre la plataforma → Don Rover físico → Conectar por USB." -ForegroundColor Green }
else { Write-Host "No se pudo instalar. Revisa el cable (que sea de datos), el controlador USB (CH340/CP210x) y cierra otras pestañas o programas que usen el puerto." -ForegroundColor Red; exit 1 }
