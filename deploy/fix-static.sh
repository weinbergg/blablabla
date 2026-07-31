#!/usr/bin/env bash
# Repair unstyled site: rebuild Next, verify CSS on disk, point nginx at .next/static.
set -euo pipefail
cd /var/www/blabla

echo "== stop =="
pm2 delete blabla 2>/dev/null || true
pkill -9 -f next-server 2>/dev/null || true
fuser -k 3000/tcp 2>/dev/null || true
sleep 1

echo "== pull & build =="
git pull
npm ci
rm -rf .next
npm run build

CSS_FILE=$(ls -1 .next/static/css/*.css | head -1)
CSS_NAME=$(basename "$CSS_FILE")
BUILD_ID=$(cat .next/BUILD_ID)
echo "BUILD_ID=$BUILD_ID"
echo "CSS_FILE=$CSS_FILE"
test -f "$CSS_FILE"

echo "== start =="
pm2 start ecosystem.config.cjs
pm2 save
sleep 2
pm2 list

echo "== local checks =="
curl -sI "http://127.0.0.1:3000/" | head -3
# Direct file through Next (may still 400 — nginx will cover it):
curl -sI "http://127.0.0.1:3000/_next/static/css/$CSS_NAME" | head -5 || true
# Disk file must exist for nginx alias:
ls -la ".next/static/css/$CSS_NAME"

echo
echo "Next: configure nginx to serve /_next/static from disk (see deploy/nginx-blablablarden.conf)."
echo "Minimal insert inside your HTTPS server block:"
echo
cat <<'NGINX'
    location /_next/static/ {
        alias /var/www/blabla/.next/static/;
        access_log off;
        expires 365d;
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }
NGINX
echo
echo "Then: nginx -t && systemctl reload nginx"
echo "Verify: curl -sI https://blablablarden.ru/_next/static/css/$CSS_NAME | head -5"
echo "Expect: HTTP/1.1 200 and content-type: text/css"
