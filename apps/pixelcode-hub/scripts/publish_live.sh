#!/usr/bin/env bash
set -euo pipefail

MESSAGE="${1:-Updating...}"
COMMIT_MSG="${2:-chore: live update}"

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

: "${GITHUB_TOKEN:?Set GITHUB_TOKEN first}"
: "${RENDER_API_KEY:?Set RENDER_API_KEY first}"
: "${ADMIN_BROADCAST_KEY:?Set ADMIN_BROADCAST_KEY first}"

GITHUB_OWNER="${GITHUB_OWNER:-hoodlandon25}"
GITHUB_REPO="${GITHUB_REPO:-ai-coding}"
GITHUB_WORKFLOW_ID="${GITHUB_WORKFLOW_ID:-243383081}"
RENDER_SERVICE_ID="${RENDER_SERVICE_ID:-srv-d6n20r24d50c73d7pch0}"
BACKEND_URL="${BACKEND_URL:-https://pixelcode-hub-backend.onrender.com}"

echo "Broadcasting updating banner..."
curl -fsS -X POST "$BACKEND_URL/admin/deploy/start" \
  -H "x-admin-key: $ADMIN_BROADCAST_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"$MESSAGE\"}" >/dev/null

finish_with_failure() {
  local fail_msg="Update failed. Please refresh manually."
  curl -fsS -X POST "$BACKEND_URL/admin/deploy/finish" \
    -H "x-admin-key: $ADMIN_BROADCAST_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"message\":\"$fail_msg\",\"refresh\":false}" >/dev/null || true
}
trap finish_with_failure ERR

echo "Committing local changes..."
git add -A
if ! git diff --cached --quiet; then
  git commit -m "$COMMIT_MSG"
else
  echo "No local changes to commit."
fi

echo "Pushing to GitHub..."
git push "https://${GITHUB_OWNER}:${GITHUB_TOKEN}@github.com/${GITHUB_OWNER}/${GITHUB_REPO}.git" main

echo "Triggering GitHub Pages deploy..."
curl -fsS -X POST \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW_ID}/dispatches" \
  -d '{"ref":"main"}' >/dev/null

echo "Triggering Render deploy..."
curl -fsS -X POST \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  "https://api.render.com/v1/services/${RENDER_SERVICE_ID}/deploys" >/dev/null

echo "Waiting for GitHub Actions..."
for _ in $(seq 1 60); do
  gh_resp="$(curl -fsS \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs?event=workflow_dispatch&per_page=1")"
  gh_status="$(echo "$gh_resp" | grep -m1 '"status"' | sed 's/.*"status": "\([^"]*\)".*/\1/')"
  gh_conclusion="$(echo "$gh_resp" | grep -m1 '"conclusion"' | sed 's/.*"conclusion": \(null\|"[^"]*"\).*/\1/')"
  if [[ "$gh_status" == "completed" ]]; then
    if [[ "$gh_conclusion" != "\"success\"" ]]; then
      echo "GitHub deploy failed: $gh_conclusion"
      exit 1
    fi
    break
  fi
  sleep 5
done

echo "Waiting for Render deploy..."
for _ in $(seq 1 60); do
  render_resp="$(curl -fsS -H "Authorization: Bearer $RENDER_API_KEY" \
    "https://api.render.com/v1/services/${RENDER_SERVICE_ID}/deploys?limit=1")"
  if echo "$render_resp" | grep -q '"status":"live"'; then
    break
  fi
  if echo "$render_resp" | grep -q '"status":"build_failed"\|"status":"update_failed"'; then
    echo "Render deploy failed"
    exit 1
  fi
  sleep 5
done

echo "Broadcasting refresh to all clients..."
curl -fsS -X POST "$BACKEND_URL/admin/deploy/finish" \
  -H "x-admin-key: $ADMIN_BROADCAST_KEY" \
  -H "Content-Type: application/json" \
  -d '{"message":"Update complete. Refreshing...","refresh":true}' >/dev/null

trap - ERR
echo "Live publish complete."
