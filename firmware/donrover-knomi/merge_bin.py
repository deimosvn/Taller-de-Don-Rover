# Después de compilar, une bootloader + particiones + app en un solo archivo por placa para
# instalarlo desde el navegador (página "Don Rover físico" de la plataforma) en la dirección 0x0,
# y actualiza el manifiesto public/firmware/donrover.json con todas las placas.
Import("env")  # noqa: F821  (lo define PlatformIO)

import hashlib
import json
import os
import re
import subprocess
from datetime import datetime, timezone

# El cargador del ESP32 clásico va en 0x1000; en los ESP32-C3 y S3, en 0x0.
BOOTLOADER_AT = {"esp32": 0x1000, "esp32c3": 0x0, "esp32s3": 0x0}
CHIP_NAME = {"esp32": "ESP32", "esp32c3": "ESP32-C3", "esp32s3": "ESP32-S3"}


def merge(source, target, env):
    build = env.subst("$BUILD_DIR")
    project = env.subst("$PROJECT_DIR")
    pioenv = env.subst("$PIOENV")
    mcu = env.BoardConfig().get("build.mcu", "esp32")
    out_dir = os.path.normpath(os.path.join(project, "..", "..", "public", "firmware"))
    os.makedirs(out_dir, exist_ok=True)
    platform = env.PioPlatform()
    esptool = os.path.join(platform.get_package_dir("tool-esptoolpy"), "esptool.py")
    boot_app0 = os.path.join(platform.get_package_dir("framework-arduinoespressif32"), "tools", "partitions", "boot_app0.bin")
    name = f"donrover-{pioenv}.bin"
    out = os.path.join(out_dir, name)
    subprocess.check_call([
        env.subst("$PYTHONEXE"), esptool, "--chip", mcu, "merge_bin", "-o", out,
        "--flash_mode", "keep", "--flash_freq", "keep", "--flash_size", "keep",
        hex(BOOTLOADER_AT.get(mcu, 0x1000)), os.path.join(build, "bootloader.bin"),
        "0x8000", os.path.join(build, "partitions.bin"),
        "0xe000", boot_app0,
        "0x10000", os.path.join(build, "firmware.bin"),
    ])
    with open(os.path.join(project, "src", "main.cpp"), encoding="utf-8") as f:
        version = re.search(r'#define FW_VERSION "([^"]+)"', f.read()).group(1)
    data = open(out, "rb").read()
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        label = env.GetProjectOption("custom_board_name")
    except Exception:  # noqa: BLE001
        label = pioenv
    entry = {
        "id": pioenv,
        "name": label,
        "chip": CHIP_NAME.get(mcu, mcu.upper()),
        "version": version,
        "file": name,
        "address": 0,
        "size": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "built": now,
    }
    manifest_path = os.path.join(out_dir, "donrover.json")
    try:
        manifest = json.load(open(manifest_path, encoding="utf-8"))
    except Exception:  # noqa: BLE001
        manifest = {"name": "Don Rover", "builds": []}
    order = ["knomi", "esp32c3-round", "esp32-devkit", "esp32c3-mini", "esp32s3-n16r8"]
    builds = [b for b in manifest.get("builds", []) if b.get("id") != pioenv] + [entry]
    builds.sort(key=lambda b: order.index(b["id"]) if b["id"] in order else 99)
    manifest = {"name": "Don Rover", "version": version, "builds": builds}
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    # Compatibilidad con el instalador anterior (solo KNOMI).
    if pioenv == "knomi":
        with open(os.path.join(out_dir, "donrover-knomi.json"), "w", encoding="utf-8") as f:
            json.dump({**entry, "name": "Don Rover · BIGTREETECH KNOMI v1"}, f, ensure_ascii=False, indent=2)
    print(f"Firmware listo para el navegador: {out} ({len(data)} bytes)")


env.AddPostAction("$BUILD_DIR/${PROGNAME}.bin", merge)  # noqa: F821
