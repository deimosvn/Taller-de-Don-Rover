#!/usr/bin/env bash
# Instala el firmware de Don Rover en la placa BIGTREETECH KNOMI v1 conectada por USB (macOS o Linux).
#
#   ./flash.sh                 # detecta el puerto solo
#   ./flash.sh /dev/ttyUSB0    # o elige el puerto
#
# Necesita Python 3. Usa la imagen del repositorio o la descarga de la plataforma publicada.
set -euo pipefail
cd "$(dirname "$0")"
PORT="${1:-}"
BIN="../../public/firmware/donrover-knomi.bin"
if [ ! -f "$BIN" ]; then
  BIN="$(mktemp -t donrover.XXXX).bin"
  echo "Descargando el firmware…"
  curl -fsSL https://tallerdedonrover.vercel.app/firmware/donrover-knomi.bin -o "$BIN"
fi
echo "Instalando esptool (herramienta oficial de Espressif)…"
python3 -m pip install --quiet --user --upgrade esptool 2>/dev/null || python3 -m pip install --quiet --upgrade esptool
ARGS=(--chip esp32 --baud 460800)
[ -n "$PORT" ] && ARGS+=(--port "$PORT")
echo "Instalando Don Rover en la placa… (si no conecta: mantén presionado BOOT y vuelve a conectar el cable)"
if ! python3 -m esptool "${ARGS[@]}" write_flash -z 0x0 "$BIN"; then
  echo "Reintentando más lento (115200)…"
  ARGS[3]=115200
  python3 -m esptool "${ARGS[@]}" write_flash -z 0x0 "$BIN"
fi
echo "¡Listo! Abre la plataforma → Don Rover físico → Conectar por USB."
