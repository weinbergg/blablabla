#!/usr/bin/env bash
# Repair ChunkLoadError / unstyled site: clean rebuild + nginx serves .next/static.
set -euo pipefail
cd /var/www/blabla

echo "== stop orphan next =="
pm2 delete blabla 2>/dev/null || true
pkill -9 -f next-server 2>/dev/null || true
fuser -k 3000/tcp 2>/dev/null || true
sleep 1
ss -ltnp | grep :3000 && echo "WARN: port 3000 still busy" || echo "порт 3000 свободен"

echo "== pull & clean build =="
git pull
npm ci
rm -rf .next
npm run build

BUILD_ID=$(cat .next/BUILD_ID)
CSS_FILE=$(ls -1 .next/static/css/*.css | head -1)
CSS_NAME=$(basename "$CSS_FILE")
DOC_CHUNK=$(find .next/static/chunks/app/documents -name 'page-*.js' 2>/dev/null | head -1 || true)
echo "BUILD_ID=$BUILD_ID"
echo "CSS=$CSS_NAME"
echo "DOC_CHUNK=${DOC_CHUNK:-none}"

echo "== ensure nginx serves /_next/static from disk =="
CONF=$(grep -RIl "blablablarden\|proxy_pass.*3000" /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | head -1 || true)
if [[ -z "${CONF:-}" ]]; then
  echo "Не найден nginx-конфиг сайта. Вставьте вручную блок из deploy/nginx-blablablarden.conf"
else
  echo "Конфиг: $CONF"
  cp -a "$CONF" "${CONF}.bak.$(date +%F-%H%M%S)"
  if grep -q 'location /_next/static/' "$CONF"; then
    echo "Блок /_next/static/ уже есть"
  else
    python3 - "$CONF" <<'PY'
from pathlib import Path
import sys
conf = Path(sys.argv[1])
text = conf.read_text()
block = """
    location /_next/static/ {
        alias /var/www/blabla/.next/static/;
        access_log off;
        expires 365d;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

"""
# Prefer inserting before the catch-all proxy location /
idx = text.find("location / {")
if idx < 0:
    idx = text.find("location /{")
if idx < 0:
    raise SystemExit("не найден location / — вставьте блок вручную")
conf.write_text(text[:idx] + block + text[idx:])
print("OK: блок вставлен")
PY
  fi
  nginx -t
  systemctl reload nginx
  echo "nginx reloaded"
fi

echo "== start app =="
pm2 start ecosystem.config.cjs
pm2 save
sleep 2
pm2 list

echo "== verify =="
echo "-- CSS via domain --"
curl -sI "https://blablablarden.ru/_next/static/css/$CSS_NAME" | head -8 || true
if [[ -n "${DOC_CHUNK:-}" ]]; then
  REL=${DOC_CHUNK#*.next/static/}
  # URL-encode [id] → %5Bid%5D like the browser
  ENC=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$REL', safe='/.-'))")
  echo "-- document chunk via domain --"
  curl -sI "https://blablablarden.ru/_next/static/$ENC" | head -8 || true
fi

echo
echo "Готово. Жёстко обновите страницу книги (Ctrl+Shift+R)."
echo "Ожидайте HTTP 200 на CSS и на page-*.js чанке."
