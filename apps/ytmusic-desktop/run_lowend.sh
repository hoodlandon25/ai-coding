#!/usr/bin/env bash
set -euo pipefail

cd /home/hoodlandon25/ai-coding/apps/ytmusic-desktop
. .venv/bin/activate

export QT_QPA_PLATFORM=xcb
export YTMUSIC_PERF=1
export YTMUSIC_AUDIO_ONLY=1
export QTWEBENGINE_CHROMIUM_FLAGS="${QTWEBENGINE_CHROMIUM_FLAGS:-} --disable-gpu --disable-software-rasterizer --disable-features=UseOzonePlatform,CanvasOopRasterization,VaapiVideoDecoder --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-dev-shm-usage --disable-extensions --disable-background-media-suspend"

python main.py
