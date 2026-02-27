# whiteboardfox-autodraw

WhiteboardFox desktop wrapper + auto-draw helper (PyQt6 + QtWebEngine + OpenCV).

## Features
- Opens WhiteboardFox rooms directly
- Google sign-in flow support
- Persistent login/session profile
- Auto-draw from image edges
- AFK guard, pause/resume, speed presets
- Image picker with preview, search, and sorting

## System dependencies (Debian/Ubuntu/Crostini)
```bash
sudo apt-get update
sudo apt-get install -y python3 python3-venv libxcb-cursor0 libxkbcommon-x11-0 libxcb-xinerama0 fontconfig git
```

## Run locally (from repo)
```bash
cd apps/whiteboardfox-autodraw
./run.sh
```

## Easy install (one command)
```bash
bash <(curl -fsSL https://raw.githubusercontent.com/hoodlandon25/ai-coding/main/scripts/install-whiteboardfox-autodraw.sh)
```

After install, run with:
```bash
autodraw
```
