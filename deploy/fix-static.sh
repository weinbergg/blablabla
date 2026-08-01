#!/usr/bin/env bash
# Repair ChunkLoadError / unstyled site: clean rebuild + nginx serves .next/static.
# Exits non-zero if CSS is still not HTTP 200 after reload.
set -euo pipefail
cd /var/www/blabla
APP_ROOT=/var/www/blabla
STATIC_ALIAS="${APP_ROOT}/.next/static/"

echo "== stop orphan next =="
pm2 delete blabla 2>/dev/null || true
pkill -9 -f next-server 2>/dev/null || true
fuser -k 3000/tcp 2>/dev/null || true
sleep 1
ss -ltnp | grep :3000 && echo "WARN: port 3000 still busy" || echo "порт 3000 свободен"

echo "== pull & clean build =="
git pull origin main
npm ci
rm -rf .next
npm run build
npm run db:push || true

BUILD_ID=$(cat .next/BUILD_ID)
CSS_FILE=$(ls -1 .next/static/css/*.css | head -1)
CSS_NAME=$(basename "$CSS_FILE")
DOC_CHUNK=$(find .next/static/chunks/app/documents -name 'page-*.js' 2>/dev/null | head -1 || true)
FRIENDS_CHUNK=$(find .next/static/chunks/app/friends -name 'page-*.js' 2>/dev/null | head -1 || true)
echo "BUILD_ID=$BUILD_ID"
echo "CSS=$CSS_NAME"
echo "DOC_CHUNK=${DOC_CHUNK:-none}"
echo "FRIENDS_CHUNK=${FRIENDS_CHUNK:-none}"

if [[ ! -f ".next/static/css/$CSS_NAME" ]]; then
  echo "FATAL: CSS file missing on disk after build"
  exit 1
fi
# nginx (www-data) must be able to read static assets
chmod -R a+rX .next/static || true

echo "== ensure nginx serves /_next/static from disk =="
CONF=$(grep -RIl "blablablarden\|proxy_pass.*3000" /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | head -1 || true)
if [[ -z "${CONF:-}" ]]; then
  echo "Не найден nginx-конфиг сайта. Вставьте вручную блок из deploy/nginx-blablablarden.conf"
  exit 1
fi

echo "Конфиг: $CONF"
cp -a "$CONF" "${CONF}.bak.$(date +%F-%H%M%S)"
python3 - "$CONF" "$STATIC_ALIAS" <<'PY'
from pathlib import Path
import re
import sys

conf = Path(sys.argv[1])
alias = sys.argv[2]
text = conf.read_text()
block = f"""
    location /_next/static/ {{
        alias {alias};
        access_log off;
        expires 365d;
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }}

"""
# Replace any existing /_next/static/ location (including broken try_files+alias combos)
pat = re.compile(
    r"\n?[ \t]*location\s+/_next/static/\s*\{(?:[^{}]|\{[^{}]*\})*\}[ \t]*\n?",
    re.MULTILINE,
)
if pat.search(text):
    text = pat.sub("\n" + block, text, count=1)
    print("OK: блок /_next/static/ перезаписан")
else:
    idx = text.find("location / {")
    if idx < 0:
        idx = text.find("location /{")
    if idx < 0:
        raise SystemExit("не найден location / — вставьте блок вручную")
    text = text[:idx] + block + text[idx:]
    print("OK: блок /_next/static/ вставлен")
conf.write_text(text)
PY

# try_files with alias is often broken for nested paths — use pure alias only
python3 - "$CONF" "$STATIC_ALIAS" <<'PY'
from pathlib import Path
import re
import sys
conf = Path(sys.argv[1])
alias = sys.argv[2]
text = conf.read_text()
block = f"""    location /_next/static/ {{
        alias {alias};
        access_log off;
        expires 365d;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }}
"""
pat = re.compile(
    r"[ \t]*location\s+/_next/static/\s*\{(?:[^{}]|\{[^{}]*\})*\}[ \t]*\n?",
    re.MULTILINE,
)
text2, n = pat.subn(block + "\n", text, count=1)
if n != 1:
    raise SystemExit("не удалось нормализовать location /_next/static/")
conf.write_text(text2)
print("OK: alias-only location (без try_files)")
PY

nginx -t
systemctl reload nginx
echo "nginx reloaded"

echo "== start app =="
pm2 start ecosystem.config.cjs
pm2 save
sleep 2
pm2 list

echo "== verify on disk =="
ls -la ".next/static/css/$CSS_NAME"
echo "== verify via domain =="
CSS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://blablablarden.ru/_next/static/css/$CSS_NAME")
echo "CSS HTTP $CSS_CODE  (need 200)"
if [[ "$CSS_CODE" != "200" ]]; then
  echo "FATAL: CSS still not 200. Check: ls -la $STATIC_ALIAS/css/ && nginx -T | grep -A8 _next/static"
  # Fallback probe through Next directly
  echo "-- probe Next on :3000 --"
  curl -sI "http://127.0.0.1:3000/_next/static/css/$CSS_NAME" | head -8 || true
  exit 1
fi

if [[ -n "${DOC_CHUNK:-}" ]]; then
  REL=${DOC_CHUNK#*.next/static/}
  ENC=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$REL', safe='/.-'))")
  DOC_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://blablablarden.ru/_next/static/$ENC")
  echo "DOC_CHUNK HTTP $DOC_CODE"
fi
if [[ -n "${FRIENDS_CHUNK:-}" ]]; then
  REL=${FRIENDS_CHUNK#*.next/static/}
  ENC=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$REL', safe='/.-'))")
  F_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://blablablarden.ru/_next/static/$ENC")
  echo "FRIENDS_CHUNK HTTP $F_CODE"
fi

echo
echo "Готово. CSS = 200. Жёстко обновите страницу (Ctrl+Shift+R)."
