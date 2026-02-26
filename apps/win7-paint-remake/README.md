# Win7 Paint Remake (Tkinter)

A Windows 7–style Paint remake with:
- Tools, shapes, brushes, selection, crop, resize/skew, rotate/flip
- Zoom + status bar
- Auto‑draw window
- Rating window with Discord webhook (via proxy)

## One‑line install (clone + run)
```bash
git clone https://github.com/hoodlandon25/ai-coding.git
cd ai-coding/apps/win7-paint-remake
```

## Requirements
- Linux (works on Chromebook Linux too)
- Python 3.10+

### System packages
```bash
sudo apt update
sudo apt install python3-tk python3-pip -y
```

### Python packages (app)
```bash
pip3 install opencv-python-headless Pillow requests numpy --break-system-packages
```

## Run
```bash
python3 paint.py
```

## Rating Proxy (required to send ratings)
The Discord webhook is **not** stored in the app. Use the included proxy server.

### 1) Start the proxy locally
```bash
cd proxy
pip3 install -r requirements.txt --break-system-packages
export DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."
python3 server.py
```

### 2) Or host it for free on Render
Render Web Service settings:
- Root Directory: `apps/win7-paint-remake/proxy`
- Build Command: `pip install -r requirements.txt`
- Start Command: `gunicorn server:app`
- Env Var: `DISCORD_WEBHOOK_URL` = your Discord webhook

### 3) Point the app to the proxy
Option A (recommended, one‑time setup):
```bash
export PAINT_PROXY_URL="http://127.0.0.1:5000"
python3 paint.py
```
The app will save it to: `~/.config/win7-paint-remake/config.json`

Option B (set inside the app):
- `Help -> Set Rating Proxy...`

## How to use
- **Tools** are in the menu bar: `Tools`, `Image`, and `Colors`.
- **Rate App** is in `Help -> Rate App`.
- **Set Rating Proxy** is in `Help -> Set Rating Proxy...`.
- **Auto Draw** is in `View -> Auto Draw Settings`.
- **Custom file manager** is in `View -> Open File Manager`.

## Notes
- For best performance, keep zoom at 100% while drawing.
