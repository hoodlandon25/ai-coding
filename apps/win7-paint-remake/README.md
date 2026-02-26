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

## Discord Webhook (required to send ratings)
The webhook URL is **not** in the code. You must set it in your shell before running.

```bash
export PAINT_WEBHOOK_URL="https://discord.com/api/webhooks/..."
python3 paint.py
```

## How to use
- **Tools** are in the menu bar: `Tools`, `Image`, and `Colors`.
- **Rate App** is in `Help -> Rate App`.
- **Auto Draw** is in `View -> Auto Draw Settings`.
- **Custom file manager** is in `View -> Open File Manager`.

## Notes
- Right‑click a palette color (if you add palette UI later) to set Color 2.
- For best performance, keep zoom at 100% while drawing.
