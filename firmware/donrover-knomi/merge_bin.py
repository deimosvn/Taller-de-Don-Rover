# Después de compilar, une bootloader + particiones + app en un solo archivo para instalarlo
# desde el navegador (página "Don Rover físico" de la plataforma) en la dirección 0x0.
Import("env")  # noqa: F821  (lo define PlatformIO)

import hashlib
import json
import os
import re
import subprocess
from datetime import datetime, timezone


def merge(source, target, env):
    build = env.subst("$BUILD_DIR")
    project = env.subst("$PROJECT_DIR")
    out_dir = os.path.normpath(os.path.join(project, "..", "..", "public", "firmware"))
    os.makedirs(out_dir, exist_ok=True)
    platform = env.PioPlatform()
    esptool = os.path.join(platform.get_package_dir("tool-esptoolpy"), "esptool.py")
    boot_app0 = os.path.join(platform.get_package_dir("framework-arduinoespressif32"), "tools", "partitions", "boot_app0.bin")
    out = os.path.join(out_dir, "donrover-knomi.bin")
    subprocess.check_call([
        env.subst("$PYTHONEXE"), esptool, "--chip", "esp32", "merge_bin", "-o", out,
        "--flash_mode", "dio", "--flash_freq", "40m", "--flash_size", "16MB",
        "0x1000", os.path.join(build, "bootloader.bin"),
        "0x8000", os.path.join(build, "partitions.bin"),
        "0xe000", boot_app0,
        "0x10000", os.path.join(build, "firmware.bin"),
    ])
    with open(os.path.join(project, "src", "main.cpp"), encoding="utf-8") as f:
        version = re.search(r'#define FW_VERSION "([^"]+)"', f.read()).group(1)
    data = open(out, "rb").read()
    manifest = {
        "name": "Don Rover · BIGTREETECH KNOMI v1",
        "version": version,
        "file": "donrover-knomi.bin",
        "address": 0,
        "size": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "built": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    with open(os.path.join(out_dir, "donrover-knomi.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print("Firmware listo para el navegador:", out, f"({len(data)} bytes)")


env.AddPostAction("$BUILD_DIR/${PROGNAME}.bin", merge)  # noqa: F821
