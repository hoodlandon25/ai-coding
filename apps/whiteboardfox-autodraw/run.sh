#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$HOME/.venvs/wbf_browser"
VENV_PY="$VENV_DIR/bin/python"
APP="$APP_DIR/main.py"

if [ ! -x "$VENV_PY" ]; then
  python3 -m venv "$VENV_DIR"
fi

if ! "$VENV_PY" -m pip --version >/dev/null 2>&1; then
  "$VENV_PY" -m ensurepip --upgrade >/dev/null 2>&1 || {
    echo "Failed to bootstrap pip in venv."
    echo "Install: sudo apt install python3-venv"
    exit 1
  }
fi

# Prefer distro packages if present; fallback to pip install in venv.
if ! "$VENV_PY" - <<'PY'
import importlib.util
mods = ["PyQt6", "PyQt6.QtWebEngineWidgets", "cv2"]
ok = True
for m in mods:
    if importlib.util.find_spec(m) is None:
        ok = False
print("ok" if ok else "missing")
raise SystemExit(0 if ok else 1)
PY
then
  "$VENV_PY" -m pip install --upgrade --retries 1 --timeout 15 pip || true
  "$VENV_PY" -m pip install --upgrade-strategy only-if-needed --retries 1 --timeout 15 PyQt6 PyQt6-WebEngine opencv-python || {
    echo "Dependency install failed."
    echo "Try: sudo apt install python3-pyqt6 python3-pyqt6.qtwebengine python3-opencv"
    exit 1
  }
fi

# Use PyQt6 plugin directory explicitly (avoid cv2 Qt plugin path conflicts).
PYQT_PLUGINS="$("$VENV_PY" - <<'PY'
import os
import PyQt6
print(os.path.join(os.path.dirname(PyQt6.__file__), "Qt6", "plugins"))
PY
)"
export QT_PLUGIN_PATH="$PYQT_PLUGINS"
export QT_QPA_PLATFORM_PLUGIN_PATH="$PYQT_PLUGINS/platforms"

# Prefer X11 (xcb) because Wayland compositor disconnects were crashing QtWebEngine.
export QT_QPA_PLATFORM="${QT_QPA_PLATFORM:-xcb}"
# Leave Chromium flags empty by default (GPU acceleration can reduce lag).
export QTWEBENGINE_CHROMIUM_FLAGS="${QTWEBENGINE_CHROMIUM_FLAGS:-}"
# Performance baseline for heavy whiteboard canvases.
export QTWEBENGINE_CHROMIUM_FLAGS="$QTWEBENGINE_CHROMIUM_FLAGS --ignore-gpu-blocklist --enable-gpu-rasterization --enable-zero-copy --renderer-process-limit=3 --disable-background-networking --disable-component-update"

# Ensure Qt/Chromium can resolve fonts config in Crostini shells.
export FONTCONFIG_PATH="${FONTCONFIG_PATH:-/etc/fonts}"
export FONTCONFIG_FILE="${FONTCONFIG_FILE:-fonts.conf}"

exec "$VENV_PY" "$APP"
