import os
from flask import Flask, request, jsonify
import requests

app = Flask(__name__)

WEBHOOK_URL = os.environ.get("DISCORD_WEBHOOK_URL", "").strip()

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"ok": True})

@app.route("/rate", methods=["POST"])
def rate():
    if not WEBHOOK_URL:
        return jsonify({"error": "Webhook not configured"}), 500

    # Forward multipart or json to Discord webhook
    try:
        if request.files:
            payload_json = request.form.get("payload_json", "")
            files = {}
            if "file" in request.files:
                f = request.files["file"]
                files["file"] = (f.filename or "capture.png", f.stream, f.mimetype or "application/octet-stream")
            resp = requests.post(WEBHOOK_URL, data={"payload_json": payload_json}, files=files, timeout=10)
        else:
            resp = requests.post(WEBHOOK_URL, json=request.get_json(silent=True) or {}, timeout=10)
    except requests.RequestException as e:
        return jsonify({"error": str(e)}), 502

    return (resp.text, resp.status_code, resp.headers.items())

if __name__ == "__main__":
    host = os.environ.get("PROXY_HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", os.environ.get("PROXY_PORT", "5000")))
    app.run(host=host, port=port)
