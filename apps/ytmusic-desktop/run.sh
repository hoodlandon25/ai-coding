#!/usr/bin/env bash
set -euo pipefail

cd /home/hoodlandon25/ai-coding/apps/ytmusic-desktop
. .venv/bin/activate

# Force X11 on Chromebooks and apply Chromium flags for smoother playback.
export QT_QPA_PLATFORM=xcb
export QTWEBENGINE_CHROMIUM_FLAGS="${QTWEBENGINE_CHROMIUM_FLAGS:-} --ignore-gpu-blocklist --enable-gpu-rasterization --enable-zero-copy --disable-features=UseOzonePlatform"

python main.py
