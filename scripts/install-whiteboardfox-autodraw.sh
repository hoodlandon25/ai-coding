#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/hoodlandon25/ai-coding.git"
INSTALL_ROOT="${HOME}/apps"
APP_DIR="${INSTALL_ROOT}/ai-coding/apps/whiteboardfox-autodraw"
LAUNCHER="${HOME}/run_whiteboardfox_autodraw.sh"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1"
    exit 1
  }
}

need_cmd git
need_cmd python3

if command -v sudo >/dev/null 2>&1; then
  echo "Installing OS dependencies (may ask for password)..."
  sudo apt-get update
  sudo apt-get install -y python3-venv libxcb-cursor0 libxkbcommon-x11-0 libxcb-xinerama0 fontconfig
else
  echo "No sudo detected. Ensure these are installed manually:"
  echo "python3-venv libxcb-cursor0 libxkbcommon-x11-0 libxcb-xinerama0 fontconfig"
fi

mkdir -p "${INSTALL_ROOT}"
if [ ! -d "${INSTALL_ROOT}/ai-coding/.git" ]; then
  git clone "${REPO_URL}" "${INSTALL_ROOT}/ai-coding"
else
  git -C "${INSTALL_ROOT}/ai-coding" pull --ff-only
fi

cat > "${LAUNCHER}" <<'LAUNCH'
#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/apps/ai-coding/apps/whiteboardfox-autodraw"
./run.sh
LAUNCH
chmod +x "${LAUNCHER}"

mkdir -p "$HOME/.local/bin"
ln -sf "${LAUNCHER}" "$HOME/.local/bin/AutoDraw"
ln -sf "${LAUNCHER}" "$HOME/.local/bin/Autodraw"
ln -sf "${LAUNCHER}" "$HOME/.local/bin/autodraw"

if ! grep -q 'PATH="$HOME/.local/bin:$PATH"' "$HOME/.bashrc"; then
  {
    echo
    echo '# Added by WhiteboardFox AutoDraw installer'
    echo 'export PATH="$HOME/.local/bin:$PATH"'
  } >> "$HOME/.bashrc"
fi

echo
echo "Install complete."
echo "Run now: $LAUNCHER"
echo "or after reloading shell: autodraw"
echo "If current shell cannot find command, run: source ~/.bashrc"
