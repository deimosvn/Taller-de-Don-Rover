# Instala el firmware de Don Rover en la placa BIGTREETECH KNOMI v1 conectada por USB (Windows).
#
#   Uso (PowerShell, en esta carpeta):   powershell -ExecutionPolicy Bypass -File .\flash.ps1
#   Elegir el puerto a mano:             powershell -ExecutionPolicy Bypass -File .\flash.ps1 -Port COM5
#
# Necesita Python 3 (https://www.python.org/downloads/). Usa la imagen ya compilada del repositorio
# (public/firmware/donrover-knomi.bin) o, si no está, la descarga de la plataforma publicada.
param([string]$Port = "", [int]$Baud = 460800)
$ErrorActionPreference = "Stop"

$py = if (Get-Command py -ErrorAction SilentlyContinue) { "py" } elseif (Get-Command python -ErrorAction SilentlyContinue) { "python" } else { $null }
if (-not $py) { Write-Host "Falta Python 3: instálalo desde https://www.python.org/downloads/ (marca 'Add python.exe to PATH')." -ForegroundColor Red; exit 1 }

$bin = Join-Path $PSScriptRoot "..\..\public\firmware\donrover-knomi.bin"
if (-not (Test-Path $bin)) {
  $bin = Join-Path $env:TEMP "donrover-knomi.bin"
  Write-Host "Descargando el firmware…"
  Invoke-WebRequest "https://tallerdedonrover.vercel.app/firmware/donrover-knomi.bin" -OutFile $bin
}

Write-Host "Instalando esptool (herramienta oficial de Espressif)…"
& $py -m pip install --quiet --upgrade esptool

$cmd = @("-m", "esptool", "--chip", "esp32", "--baud", "$Baud")
if ($Port) { $cmd += @("--port", $Port) }
$cmd += @("write_flash", "-z", "0x0", $bin)
Write-Host "Instalando Don Rover en la placa… (si no conecta: mantén presionado BOOT, desconecta y vuelve a conectar el cable)"
& $py @cmd
if ($LASTEXITCODE -ne 0) {
  Write-Host "Reintentando más lento (115200)…" -ForegroundColor Yellow
  $cmd[5] = "115200"
  & $py @cmd
}
if ($LASTEXITCODE -eq 0) { Write-Host "¡Listo! Don Rover quedó instalado. Abre la plataforma → Don Rover físico → Conectar por USB." -ForegroundColor Green }
else { Write-Host "No se pudo instalar. Revisa el cable (que sea de datos), el controlador USB (CH340/CP210x) y cierra otras pestañas o programas que usen el puerto." -ForegroundColor Red; exit 1 }
