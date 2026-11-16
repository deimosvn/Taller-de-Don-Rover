"""Genera los diagramas de conexión de Don Rover (docs/img/hardware/*.svg).

Cada placa económica se conecta al mismo módulo de pantalla redonda GC9A01 (1.28", 240 × 240)
con 8 cables. Los pines salen de firmware/donrover-knomi/platformio.ini: si cambias uno allá,
cámbialo aquí y vuelve a correr:  python3 docs/tools/diagramas.py
"""
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "img" / "hardware"
OUT.mkdir(parents=True, exist_ok=True)

FONT = "font-family=\"'Segoe UI', Roboto, Helvetica, Arial, sans-serif\""
MONO = "font-family=\"'JetBrains Mono', Consolas, 'Courier New', monospace\""

# Señal → (color del cable, nombre en el módulo GC9A01, qué hace)
SIGNALS = [
    ("VCC", "#E53935", "VCC", "Alimentación 3.3 V"),
    ("GND", "#37474F", "GND", "Tierra"),
    ("SCLK", "#F9A825", "SCL", "Reloj SPI"),
    ("MOSI", "#1E88E5", "SDA", "Datos SPI"),
    ("RST", "#8E24AA", "RES", "Reinicio de la pantalla"),
    ("DC", "#43A047", "DC", "Dato / comando"),
    ("CS", "#FB8C00", "CS", "Selección de chip"),
    ("BL", "#00ACC1", "BLK", "Luz de fondo (PWM)"),
]


def esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def face(cx: float, cy: float, r: float) -> str:
    """La cara de Don Rover (igual que en la placa) dentro de la pantalla redonda."""
    k = r / 120
    def p(x, y):
        return cx + (x - 120) * k, cy + (y - 120) * k
    lx, ly = p(78, 102)
    rx, ry = p(162, 102)
    mx, my = p(120, 172)
    s = [
        f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="#15102F"/>',
        f'<circle cx="{cx}" cy="{cy}" r="{r*0.925:.1f}" fill="#241C4E"/>',
    ]
    for ex, ey in ((lx, ly), (rx, ry)):
        s += [
            f'<circle cx="{ex:.1f}" cy="{ey:.1f}" r="{34*k:.1f}" fill="#5A4F9A"/>',
            f'<circle cx="{ex:.1f}" cy="{ey:.1f}" r="{29*k:.1f}" fill="#0E0A24"/>',
            f'<circle cx="{ex:.1f}" cy="{ey:.1f}" r="{19*k:.1f}" fill="#7FDBFF"/>',
            f'<circle cx="{ex:.1f}" cy="{ey:.1f}" r="{8*k:.1f}" fill="#0B2F40"/>',
            f'<circle cx="{ex-7*k:.1f}" cy="{ey-8*k:.1f}" r="{4*k:.1f}" fill="#FFF8EC"/>',
        ]
    s.append(f'<path d="M{mx-26*k:.1f} {my-6*k:.1f} Q{mx:.1f} {my+20*k:.1f} {mx+26*k:.1f} {my-6*k:.1f}" fill="none" stroke="#7FDBFF" stroke-width="{6*k:.1f}" stroke-linecap="round"/>')
    return "\n".join(s)


def card(w: int, h: int, title: str, subtitle: str) -> list[str]:
    return [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-label="{esc(title)}">',
        f'<rect x="1" y="1" width="{w-2}" height="{h-2}" rx="22" fill="#FFFBF5" stroke="#E7D9CB" stroke-width="2"/>',
        f'<text x="32" y="50" {FONT} font-size="24" font-weight="700" fill="#2A120D">{esc(title)}</text>',
        f'<text x="32" y="78" {FONT} font-size="15" fill="#6B3F33">{esc(subtitle)}</text>',
    ]


def wiring(slug: str, title: str, subtitle: str, board: str, chip: str, pins: dict[str, str], notes: list[str],
           button: str, board_color: str = "#1F3A5F") -> None:
    """Placa a la izquierda, módulo GC9A01 a la derecha y un cable de color por señal."""
    W, H = 1100, 790
    s = card(W, H, title, subtitle)
    # ---- placa ----
    bx, by, bw, bh = 40, 110, 300, 470
    s += [
        f'<rect x="{bx}" y="{by}" width="{bw}" height="{bh}" rx="16" fill="{board_color}"/>',
        f'<rect x="{bx+80}" y="{by+18}" width="140" height="30" rx="6" fill="#C9CCD6"/>',
        f'<text x="{bx+150}" y="{by+38}" {FONT} font-size="13" font-weight="700" fill="#263238" text-anchor="middle">USB</text>',
        f'<rect x="{bx+45}" y="{by+70}" width="180" height="110" rx="8" fill="#B0B6C3" stroke="#8C93A3" stroke-width="2"/>',
        f'<text x="{bx+135}" y="{by+120}" {FONT} font-size="{15 if len(chip) > 10 else 17}" font-weight="700" fill="#263238" text-anchor="middle">{esc(chip)}</text>',
        f'<text x="{bx+135}" y="{by+143}" {FONT} font-size="12" fill="#37474F" text-anchor="middle">{esc(board)}</text>',
        f'<circle cx="{bx+40}" cy="{by+bh-40}" r="14" fill="#ECEFF1" stroke="#90A4AE" stroke-width="3"/>',
        f'<text x="{bx+64}" y="{by+bh-35}" {FONT} font-size="13" font-weight="700" fill="#ECEFF1">BOOT = botón de Don Rover ({esc(button)})</text>',
    ]
    # ---- módulo GC9A01 ----
    mx, my = 820, 150
    s += [
        f'<rect x="{mx-150}" y="{my+190}" width="300" height="255" rx="14" fill="#1B5E20"/>',
        face(mx, my + 120, 118),
        f'<circle cx="{mx}" cy="{my+120}" r="122" fill="none" stroke="#2A120D" stroke-width="5"/>',
        f'<text x="{mx}" y="{my+300}" {FONT} font-size="15" font-weight="700" fill="#E8F5E9" text-anchor="middle">Pantalla redonda GC9A01</text>',
        f'<text x="{mx}" y="{my+320}" {FONT} font-size="12" fill="#C8E6C9" text-anchor="middle">1.28″ · 240 × 240 · SPI</text>',
    ]
    # Pines del módulo en fila (abajo del PCB) y de la placa en columna (derecha del PCB).
    n = len(SIGNALS)
    mod_y = my + 420
    mod_x0 = mx - 131
    step_m = 37.5
    board_x = bx + bw
    board_y0 = by + 205
    step_b = 30
    for i, (sig, color, mod_name, what) in enumerate(SIGNALS):
        gpio = pins[sig]
        py = board_y0 + i * step_b
        px = mod_x0 + i * step_m
        # pin de la placa
        s += [
            f'<rect x="{board_x-14}" y="{py-8}" width="16" height="16" rx="3" fill="#FFD54F" stroke="#B28704"/>',
            f'<text x="{board_x-22}" y="{py+5}" {MONO} font-size="14" font-weight="700" fill="#FFFFFF" text-anchor="end">{esc(gpio)}</text>',
        ]
        # pin del módulo
        s += [
            f'<rect x="{px-8}" y="{mod_y-8}" width="16" height="16" rx="3" fill="#FFD54F" stroke="#B28704"/>',
            f'<text x="{px}" y="{mod_y-16}" {MONO} font-size="12" font-weight="700" fill="#E8F5E9" text-anchor="middle">{esc(mod_name)}</text>',
        ]
        # cable: sale a la derecha, baja/sube a su carril y llega por debajo del módulo
        lane_x = board_x + 40 + i * 26
        bottom = mod_y + 36 + i * 9
        d = f"M{board_x+2} {py} H{lane_x} V{bottom} H{px} V{mod_y+8}"
        s.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>')
    # ---- tabla de conexiones ----
    tx, ty = 380, 108
    s.append(f'<text x="{tx}" y="{ty}" {FONT} font-size="15" font-weight="700" fill="#2A120D">Conexiones (placa → pantalla)</text>')
    for i, (sig, color, mod_name, what) in enumerate(SIGNALS):
        y = ty + 26 + i * 25
        s += [
            f'<rect x="{tx}" y="{y-12}" width="22" height="14" rx="4" fill="{color}"/>',
            f'<text x="{tx+32}" y="{y}" {MONO} font-size="13" font-weight="700" fill="#2A120D">{esc(pins[sig]):<7} → {esc(mod_name)}</text>',
            f'<text x="{tx+170}" y="{y}" {FONT} font-size="12.5" fill="#6B3F33">{esc(what)}</text>',
        ]
    # ---- notas (debajo de los cables) ----
    ny = 712
    s.append(f'<line x1="32" y1="{ny-26}" x2="{W-32}" y2="{ny-26}" stroke="#E7D9CB" stroke-width="2"/>')
    for i, note in enumerate(notes):
        s.append(f'<text x="40" y="{ny + i*22}" {FONT} font-size="13.5" fill="#4E342E">• {esc(note)}</text>')
    s.append("</svg>")
    (OUT / f"{slug}.svg").write_text("\n".join(s), encoding="utf-8")
    print("listo", slug)


wiring(
    "esp32-devkit",
    "ESP32 DevKit V1 + pantalla GC9A01",
    "Entorno de PlatformIO: esp32-devkit · los mismos pines de pantalla que la KNOMI",
    "DevKit V1 · 4 MB",
    "ESP32-WROOM-32",
    {"VCC": "3V3", "GND": "GND", "SCLK": "GPIO18", "MOSI": "GPIO23", "RST": "GPIO4", "DC": "GPIO19", "CS": "GPIO5", "BL": "GPIO22"},
    [
        "Alimenta la pantalla con 3V3 (no con VIN/5 V). Cables cortos: menos de 20 cm.",
        "El botón BOOT de la placa (GPIO0) es el botón de Don Rover. No lo mantengas presionado al conectar el cable.",
        "Sin PSRAM la cara usa 256 colores; con Wi-Fi y nube a la vez la memoria queda justa.",
    ],
    "GPIO0",
)

wiring(
    "esp32c3-mini",
    "ESP32-C3 SuperMini + pantalla GC9A01",
    "Entorno de PlatformIO: esp32c3-mini · la opción más barata y pequeña (USB nativo)",
    "SuperMini · 4 MB",
    "ESP32-C3",
    {"VCC": "3V3", "GND": "GND", "SCLK": "GPIO4", "MOSI": "GPIO6", "RST": "GPIO3", "DC": "GPIO10", "CS": "GPIO7", "BL": "GPIO5"},
    [
        "Se evitan GPIO2, GPIO8 y GPIO9 porque deciden cómo arranca el chip (y GPIO8 tiene el LED).",
        "El botón BOOT (GPIO9) es el botón de Don Rover. Para instalar: mantén BOOT, conecta el cable y suelta.",
        "USB nativo: en Chrome aparece como «USB JTAG/serial debug unit».",
    ],
    "GPIO9",
    board_color="#263238",
)

wiring(
    "esp32s3-n16r8",
    "ESP32-S3 DevKitC N16R8 + pantalla GC9A01",
    "Entorno de PlatformIO: esp32s3-n16r8 · 16 MB de flash y 8 MB de PSRAM: colores completos y nube",
    "DevKitC-1 · N16R8",
    "ESP32-S3",
    {"VCC": "3V3", "GND": "GND", "SCLK": "GPIO12", "MOSI": "GPIO11", "RST": "GPIO14", "DC": "GPIO9", "CS": "GPIO10", "BL": "GPIO21"},
    [
        "Usa el puerto USB marcado «COM» (el otro es el USB nativo).",
        "El botón BOOT (GPIO0) es el botón de Don Rover.",
        "Si tu placa es N8R2 (PSRAM de 4 líneas), cambia memory_type a qio_qspi en platformio.ini.",
    ],
    "GPIO0",
    board_color="#0D47A1",
)


def blocks(slug: str, title: str, subtitle: str, boxes: list[tuple], links: list[tuple], notes: list[str]) -> None:
    """Diagrama de bloques para placas con la pantalla integrada (no hay que cablear nada)."""
    W, H = 1100, 600
    s = card(W, H, title, subtitle)
    pos = {}
    for key, x, y, w, h, label, sub, fill, fg in boxes:
        pos[key] = (x, y, w, h)
        s += [
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14" fill="{fill}"/>',
            f'<text x="{x+w/2}" y="{y+h/2 - (6 if sub else -5)}" {FONT} font-size="16" font-weight="700" fill="{fg}" text-anchor="middle">{esc(label)}</text>',
        ]
        if sub:
            for j, line in enumerate(sub.split("\n")):
                s.append(f'<text x="{x+w/2}" y="{y+h/2 + 16 + j*16}" {FONT} font-size="12.5" fill="{fg}" opacity="0.85" text-anchor="middle">{esc(line)}</text>')
    labels: list[str] = []
    for link in links:
        a, b, label, color, side = link[:5]
        dx, dy = link[5] if len(link) > 5 else (0, 0)
        ax, ay, aw, ah = pos[a]
        bx_, by_, bw, bh = pos[b]
        if side == "h":
            if ax + aw / 2 <= bx_ + bw / 2:
                x1, x2 = ax + aw, bx_
            else:
                x1, x2 = ax, bx_ + bw
            y1, y2 = ay + ah / 2, by_ + bh / 2
            d = f"M{x1} {y1} C{(x1+x2)/2} {y1} {(x1+x2)/2} {y2} {x2} {y2}"
            lx, ly = (x1 + x2) / 2, (y1 + y2) / 2 - 12
        else:
            x1, y1 = ax + aw / 2, ay + ah
            x2, y2 = bx_ + bw / 2, by_
            d = f"M{x1} {y1} C{x1} {(y1+y2)/2} {x2} {(y1+y2)/2} {x2} {y2}"
            lx, ly = (x1 + x2) / 2 + 8, (y1 + y2) / 2
        s.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="4" stroke-linecap="round"/>')
        # La etiqueta va en una pastilla del color del fondo, encima de todos los cables:
        # si un cable pasa por ahí, se ve que pasa por debajo y el texto se lee completo.
        lx, ly = lx + dx, ly + dy
        lines = label.split("\n")
        tw = max(len(line) for line in lines) * 7.6
        labels.append(
            f'<rect x="{lx - tw/2 - 7:.1f}" y="{ly - 14}" width="{tw + 14:.1f}" height="{15*len(lines) + 6}" rx="8" '
            f'fill="#FFFBF5" stroke="{color}" stroke-opacity="0.35" stroke-width="1.2"/>'
        )
        for j, line in enumerate(lines):
            labels.append(f'<text x="{lx}" y="{ly + j*15}" {MONO} font-size="12.5" font-weight="700" fill="{color}" text-anchor="middle">{esc(line)}</text>')
    s += labels
    for i, note in enumerate(notes):
        s.append(f'<text x="40" y="{H - 62 + i*21}" {FONT} font-size="13" fill="#4E342E">• {esc(note)}</text>')
    s.append("</svg>")
    (OUT / f"{slug}.svg").write_text("\n".join(s), encoding="utf-8")
    print("listo", slug)


blocks(
    "knomi",
    "BIGTREETECH KNOMI v1 · todo integrado",
    "Entorno de PlatformIO: knomi · no hay que soldar ni cablear: conecta el USB-C y listo",
    [
        ("usb", 40, 115, 170, 74, "USB-C", "5 V + datos", "#455A64", "#FFFFFF"),
        ("uart", 40, 235, 170, 74, "USB-serie", "115200 baudios", "#607D8B", "#FFFFFF"),
        ("jst", 40, 345, 170, 66, "Conector JST", "VIN / GND · 5 V", "#8D6E63", "#FFFFFF"),
        ("boot", 40, 440, 170, 66, "Botón BOOT", "toque o sostener", "#E65100", "#FFFFFF"),
        ("esp", 380, 215, 250, 150, "ESP32-WROVER-E", "16 MB flash · 8 MB PSRAM\n240 MHz · Wi-Fi", "#1F3A5F", "#FFFFFF"),
        ("lcd", 780, 120, 280, 100, "Pantalla GC9A01", "1.28″ · 240 × 240 · SPI 80 MHz", "#241C4E", "#FFFFFF"),
        ("bl", 780, 300, 280, 80, "AW9346 · luz de fondo", "16 niveles por pulsos", "#00838F", "#FFFFFF"),
    ],
    [
        ("usb", "uart", "D+ / D-", "#455A64", "v"),
        ("uart", "esp", "TX0 / RX0 · EN", "#607D8B", "h"),
        ("jst", "esp", "5 V → 3.3 V", "#8D6E63", "h", (-30, 8)),
        ("boot", "esp", "GPIO0", "#E65100", "h", (-40, 30)),
        ("esp", "lcd", "MOSI 23 · SCLK 18\nCS 5 · DC 19 · RST 4", "#5E35B1", "h", (215, 30)),
        ("esp", "bl", "GPIO2", "#00838F", "h"),
    ],
    [
        "Pines tomados del firmware oficial de BIGTREETECH (rama firmware, src/pinout_knomi_v1.h).",
        "La pantalla necesita la inversión de color encendida (firmware 1.1.0 o más nuevo).",
    ],
)

blocks(
    "esp32c3-round",
    "ESP32-2424S012 · pantalla redonda táctil integrada",
    "Entorno de PlatformIO: esp32c3-round · la placa más barata que ya trae la pantalla (sin cables)",
    [
        ("usb", 40, 150, 170, 90, "USB-C", "USB nativo del C3", "#455A64", "#FFFFFF"),
        ("esp", 380, 210, 250, 150, "ESP32-C3", "4 MB flash · 160 MHz\nWi-Fi · sin PSRAM", "#263238", "#FFFFFF"),
        ("boot", 40, 360, 170, 80, "Botón BOOT", "GPIO9", "#E65100", "#FFFFFF"),
        ("lcd", 780, 110, 280, 100, "Pantalla GC9A01", "1.28″ · 240 × 240", "#241C4E", "#FFFFFF"),
        ("bl", 780, 250, 280, 70, "Luz de fondo", "transistor · PWM", "#00838F", "#FFFFFF"),
        ("touch", 780, 360, 280, 90, "Táctil CST816S", "tocar la cara = botón", "#2E7D32", "#FFFFFF"),
    ],
    [
        ("usb", "esp", "D+ 19 / D- 18", "#455A64", "h"),
        ("boot", "esp", "GPIO9", "#E65100", "h"),
        ("esp", "lcd", "SCLK 6 · MOSI 7\nCS 10 · DC 2", "#5E35B1", "h", (0, -30)),
        ("esp", "bl", "GPIO3", "#00838F", "h"),
        ("esp", "touch", "SDA 4 · SCL 5\nRST 1 · INT 0", "#2E7D32", "h", (10, 22)),
    ],
    [
        "Pines de la definición pública de la placa (rzeldent/platformio-espressif32-sunton).",
        "El reinicio de la pantalla va al botón RST de la placa: no usa un GPIO.",
    ],
)
