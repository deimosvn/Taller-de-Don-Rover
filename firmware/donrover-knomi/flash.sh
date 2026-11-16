#!/usr/bin/env bash
# Instala el firmware de Don Rover en una placa conectada por USB (macOS o Linux).
#
#   ./flash.sh                          # KNOMI v1, detecta el puerto solo
#   ./flash.sh esp32c3-mini             # otra placa
#   ./flash.sh knomi /dev/ttyUSB0       # placa y puerto
#
# Placas: knomi · esp32c3-round · esp32-devkit · esp32c3-mini · esp32s3-n16r8
# Necesita Python 3. Usa la imagen del repositorio o la descarga de la plataforma publicada.
set -euo pipefail
cd "$(dirname "$0")"
BOARD="${1:-knomi}"
PORT="${2:-}"
case "$BOARD" in
  knomi|esp32c3-round|esp32-devkit|esp32c3-mini|esp32s3-n16r8) ;;
  *) echo "Placa desconocida: $BOARD"; exit 1 ;;
esac
BIN="../../public/firmware/donrover-$BOARD.bin"
if [ ! -f "$BIN" ]; then
  BIN="$(mktemp -t donrover.XXXX).bin"
  echo "Descargando el firmware ($BOARD)…"
  curl -fsSL "https://tallerdedonrover.vercel.app/firmware/donrover-$BOARD.bin" -o "$BIN"
fi
echo "Instalando esptool (herramienta oficial de Espressif)…"
python3 -m pip install --quiet --user --upgrade esptool 2>/dev/null || python3 -m pip install --quiet --upgrade esptool
ARGS=(--baud 460800)
[ -n "$PORT" ] && ARGS+=(--port "$PORT")
echo "Instalando Don Rover ($BOARD)… (si no conecta: mantén presionado BOOT y vuelve a conectar el cable)"
if ! python3 -m esptool "${ARGS[@]}" write_flash -z 0x0 "$BIN"; then
  echo "Reintentando más lento (115200)…"
  ARGS[1]=115200
  python3 -m esptool "${ARGS[@]}" write_flash -z 0x0 "$BIN"
fi
echo "¡Listo! Abre la plataforma → Don Rover físico → Conectar por USB."
