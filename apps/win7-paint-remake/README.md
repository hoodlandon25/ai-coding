# Win7 Paint Remake (Tkinter)

A Windows 7–style Paint remake with:
- Tools, shapes, brushes, selection, crop, resize/skew, rotate/flip
- Zoom + status bar
- Auto‑draw window
- Rating window with Discord webhook

## Requirements
- Linux (works on Chromebook Linux too)
- Python 3.10+

### System packages
```bash
sudo apt update
sudo apt install python3-tk python3-pip -y
```

### Python packages
```bash
pip3 install opencv-python-headless Pillow requests numpy --break-system-packages
```

## Run
```bash
python3 paint.py
```

## Discord Webhook (for ratings)
The webhook URL is **not** stored in code. It’s saved locally on first use.

### Option A: one‑time setup (recommended)
```bash
export PAINT_WEBHOOK_URL="https://discord.com/api/webhooks/..."
python3 paint.py
```
- The app will save it to: `~/.config/win7-paint-remake/config.json`

### Option B: set it manually in the local config
```bash
python3 - <<'PY'
import json, os
p = os.path.expanduser("~/.config/win7-paint-remake")
os.makedirs(p, exist_ok=True)
with open(os.path.join(p, "config.json"), "w") as f:
    json.dump({"webhook_url": "https://discord.com/api/webhooks/..."}, f)
print("Saved.")
PY
```

## How to use
- **Tools** are in the menu bar: `Tools`, `Image`, and `Colors`.
- **Rate App** is in `Help -> Rate App`.
- **Set Webhook** is in `Help -> Set Webhook...`.
- **Auto Draw** is in `View -> Auto Draw Settings`.
- **Custom file manager** is in `View -> Open File Manager`.

## Notes
- For best performance, keep zoom at 100% while drawing.
