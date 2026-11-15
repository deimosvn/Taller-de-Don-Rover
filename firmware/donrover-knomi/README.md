# Firmware de Don Rover · BIGTREETECH KNOMI v1

Convierte la placa **BIGTREETECH KNOMI v1** (ESP32-WROVER-E, 16 MB de flash, 8 MB de PSRAM, pantalla redonda GC9A01 de 240 × 240) en la cara de **Don Rover**, el asistente físico del Taller de Don Rover.

La placa **no tiene micrófono ni bocina**: la computadora del profe habla por sus bocinas y escucha con su micrófono; la placa muestra la cara, mueve la boca mientras Don Rover habla, cambia de expresión según la misión y dibuja el tiempo que queda como un anillo.

## Instalar

**Desde el navegador (recomendado).** Abre la plataforma en Chrome o Edge → `#/donrover` → *Instalar en la placa*. Usa la imagen ya compilada de `public/firmware/donrover-knomi.bin` y la herramienta oficial de Espressif (`esptool-js`).

**Desde la terminal, sin compilar** (solo necesita Python 3; detecta el puerto solo):

```powershell
# Windows (PowerShell), en esta carpeta
powershell -ExecutionPolicy Bypass -File .\flash.ps1          # o: .\flash.ps1 -Port COM5
```

```bash
# macOS o Linux
./flash.sh                                                    # o: ./flash.sh /dev/ttyUSB0
```

Sin clonar el repositorio:

```bash
python3 -m pip install esptool
curl -LO https://tallerdedonrover.vercel.app/firmware/donrover-knomi.bin
python3 -m esptool --chip esp32 --baud 230400 write_flash -z 0x0 donrover-knomi.bin
```

**Compilando** (con [PlatformIO](https://platformio.org/install/cli)):

```bash
cd firmware/donrover-knomi
pio run -t upload        # compila e instala por USB
pio device monitor       # ver los mensajes (115200)
```

`pio run` también regenera `public/firmware/donrover-knomi.bin` y `donrover-knomi.json` (versión, tamaño y SHA-256) con `merge_bin.py`, para que el instalador del navegador use siempre la última versión. Si la placa no entra al modo de carga, mantén presionado su botón **BOOT** al conectar el cable.

## Pines (del firmware oficial de KNOMI, rama `firmware`, `src/pinout_knomi_v1.h`)

| Señal | GPIO |
| --- | --- |
| Pantalla MOSI / SCLK | 23 / 18 |
| Pantalla CS / DC / RST | 5 / 19 / 4 |
| Luz de fondo (PWM) | 2 |
| Botón BOOT | 0 |

## Cómo se conecta con la plataforma

Tres caminos con el mismo protocolo (una línea JSON por mensaje):

| Camino | Cuándo | Detalle |
| --- | --- | --- |
| **USB** (Web Serial) | Placa conectada a la computadora del profe | 115200 baudios. Lo más confiable y con la boca mejor sincronizada. Funciona desde la plataforma publicada (HTTPS). |
| **Wi-Fi local** | Placa y computadora en la misma red | WebSocket en `ws://<ip>:81` y HTTP en el puerto 80 (`GET /status`, `POST /cmd`, página para configurar el Wi-Fi). mDNS: `donrover.local`. Una página HTTPS no siempre puede abrir `ws://`: entonces se usa `POST /cmd` (Chrome pide permiso de *red local*) o la nube. |
| **Nube** | Placa con Wi-Fi e internet | La placa pide `<plataforma>/api/realtime` y se une al canal de Supabase Realtime `donrover-bot-<ID>`. La plataforma se conecta con el código de 6 caracteres de la placa. |

Sin Wi-Fi configurado, la placa abre la red **`DonRover-<ID>`** con una página para elegir la red (portal cautivo). También se puede configurar desde `#/donrover` por USB.

## Protocolo

Computadora → placa:

| Mensaje | Efecto |
| --- | --- |
| `{"t":"hello"}` | La placa contesta con `hi` |
| `{"t":"ping"}` | Mantiene viva la conexión (cada 4 s) |
| `{"t":"face","e":"happy","ms":3000}` | Expresión: `neutral`, `happy`, `sad`, `alert`, `think`, `wow`, `sleep`, `listen`, `star`. Con `ms` vuelve sola a la neutral. |
| `{"t":"talk","on":1}` | Habla: la boca se mueve con sílabas propias hasta `on:0` |
| `{"t":"m","v":70}` | Golpe de voz (0–100) por cada palabra que dice la computadora |
| `{"t":"look","x":-40,"y":10}` | Hacia dónde mira (−100…100) |
| `{"t":"ring","p":350,"c":"#FFC93C"}` | Anillo de progreso (0–1000; −1 lo oculta) |
| `{"t":"pulse","c":"#B69CFF"}` | Anillo que late (escuchando); `"c":""` lo apaga |
| `{"t":"card","title":"ABCD","sub":"…","ms":8000}` | Tarjeta con texto grande (título vacío la oculta) |
| `{"t":"bl","v":200}` | Brillo de la pantalla |
| `{"t":"wifi","ssid":"…","pass":"…"}` · `{"t":"forget"}` | Guardar u olvidar el Wi-Fi |
| `{"t":"app","url":"https://…"}` | Dirección de la plataforma (para el canal en la nube) |
| `{"t":"reboot"}` | Reiniciar |

Placa → computadora: `{"t":"hi","fw","id","wifi","ssid","ip","cloud","ap","app","face"}` al arrancar, al cambiar la red o al recibir `hello`; `{"t":"btn","k":"short"}` (toque corto: Don Rover repite lo último) y `{"t":"btn","k":"long"}` (sostenido: escucha una pregunta). Si se mantiene 5 s, la pantalla muestra su código e IP.

## Estructura

```
src/main.cpp   protocolo, USB y botón
src/face.cpp   cara animada (sprite de 240 × 240 en PSRAM, ~30 cuadros por segundo)
src/net.cpp    Wi-Fi, portal de configuración, WebSocket, HTTP y canal en la nube (tarea propia)
merge_bin.py   une bootloader + particiones + app para el instalador del navegador
```

La red corre en su propia tarea de FreeRTOS: la cara y el USB nunca esperan a que se conecte el Wi-Fi o la nube. El canal en la nube usa TLS sin verificar el certificado (solo viajan órdenes de la cara y la clave pública *anon*).
