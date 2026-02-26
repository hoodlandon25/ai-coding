# YT Music Desktop (PySide6)

This app embeds YouTube Music in a desktop window and gives you custom controls.

## Install (Debian/Chromebook Linux)

```bash
sudo apt-get update
sudo apt-get install -y python3-venv libxcb-xinerama0 libxkbcommon-x11-0

cd /home/hoodlandon25/ai-coding/apps/ytmusic-desktop
python3 -m venv .venv
. .venv/bin/activate
pip install --upgrade pip PySide6
```

## Run

Recommended (audio stability + audio-only):
```bash
/home/hoodlandon25/ai-coding/apps/ytmusic-desktop/run_audio_fix.sh
```

Fallback (performance mode):
```bash
/home/hoodlandon25/ai-coding/apps/ytmusic-desktop/run_lowend.sh
```

## Controls

- Search bar opens results in the embedded player
- `Space` play/pause
- `Ctrl+Right` next
- `Ctrl+Left` previous
- `Ctrl+K` focus search

## Notes

- Sign-in is disabled and blocked in this app.
- Playback requires clicking inside the player at least once on some systems.
