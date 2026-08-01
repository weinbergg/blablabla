#!/usr/bin/env bash
# Fix /uploads/ 404 (reader can't open books). Safe to run alone without full rebuild.
set -euo pipefail
APP_ROOT=/var/www/blabla
CONF=$(grep -RIl "blablablarden\|proxy_pass.*3000" /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | head -1 || true)
if [[ -z "${CONF:-}" ]]; then
  echo "nginx site config not found"
  exit 1
fi
cp -a "$CONF" "${CONF}.bak.uploads.$(date +%F-%H%M%S)"
python3 - "$CONF" <<'PY'
from pathlib import Path
import re, sys
conf = Path(sys.argv[1])
text = conf.read_text()
block = """    location /uploads/ {
        root /var/www/blabla/public;
        access_log off;
        expires 7d;
        add_header Cache-Control "public, max-age=604800";
    }
"""
pat = re.compile(
    r"[ \t]*location\s+/uploads/\s*\{(?:[^{}]|\{[^{}]*\})*\}[ \t]*\n?",
    re.MULTILINE,
)
if pat.search(text):
    text = pat.sub(block + "\n", text, count=1)
    print("rewrote /uploads/")
else:
    idx = text.find("location / {")
    if idx < 0:
        idx = text.find("location /{")
    if idx < 0:
        raise SystemExit("location / not found")
    text = text[:idx] + block + "\n" + text[idx:]
    print("inserted /uploads/")
conf.write_text(text)
PY
chmod -R a+rX "$APP_ROOT/public/uploads" || true
nginx -t
systemctl reload nginx
echo "== sample check =="
SAMPLE=$(find "$APP_ROOT/public/uploads" -type f -name '*.pdf' | head -1 || true)
if [[ -n "$SAMPLE" ]]; then
  REL=${SAMPLE#"$APP_ROOT/public"}
  echo "disk: $SAMPLE"
  curl -sI "https://blablablarden.ru${REL}" | head -8
else
  echo "no pdf in uploads"
fi
