#!/usr/bin/env bash
# Production release — the ONLY supported way to deploy blablablarden.
#
# Why the site kept losing CSS / breaking books:
#   1) `rm -rf .next` while Node/nginx still served the previous build
#   2) New HTML referenced new hashed chunks; old hashes were already gone → 404
#   3) Clients mid-session kept old JS shells that requested deleted chunks
#
# This script never deletes live assets first. It:
#   - builds into .next-building (old .next stays up)
#   - merges hashed files into static-assets/ (nginx serves this forever-ish)
#   - atomically swaps .next-building → .next
#   - restarts pm2 only after assets are in place
#   - verifies CSS returns HTTP 200
set -euo pipefail

APP_ROOT=/var/www/blabla
cd "$APP_ROOT"

STATIC_ROOT="${APP_ROOT}/static-assets"
BUILD_DIR=".next-building"
# Keep enough prior hashed assets so open tabs survive several deploys.
KEEP_BUILDS="${KEEP_BUILDS:-20}"

echo "== release $(date -u +%Y-%m-%dT%H:%M:%SZ) =="

echo "== pull =="
git pull origin main
npm ci

echo "== build into ${BUILD_DIR} (live .next untouched) =="
rm -rf "${BUILD_DIR}"
NEXT_DIST_DIR="${BUILD_DIR}" npm run build
npm run db:push || true

BUILD_ID=$(cat "${BUILD_DIR}/BUILD_ID")
CSS_FILE=$(ls -1 "${BUILD_DIR}/static/css/"*.css | head -1)
CSS_NAME=$(basename "$CSS_FILE")
echo "BUILD_ID=${BUILD_ID}"
echo "CSS=${CSS_NAME}"

if [[ ! -f "${BUILD_DIR}/static/css/${CSS_NAME}" ]]; then
  echo "FATAL: CSS missing from build output"
  exit 1
fi

echo "== merge hashed static into ${STATIC_ROOT} =="
mkdir -p "${STATIC_ROOT}" "${STATIC_ROOT}/.builds"
# Content-hashed filenames: old + new coexist. Nginx always reads STATIC_ROOT.
rsync -a "${BUILD_DIR}/static/" "${STATIC_ROOT}/"
find "${BUILD_DIR}/static" -type f -printf '%P\n' > "${STATIC_ROOT}/.builds/${BUILD_ID}.txt"
chmod -R a+rX "${STATIC_ROOT}"

# Drop manifests beyond KEEP_BUILDS; remove files only referenced by pruned builds.
mapfile -t ALL_MANIFESTS < <(ls -1t "${STATIC_ROOT}/.builds/"*.txt 2>/dev/null || true)
if ((${#ALL_MANIFESTS[@]} > KEEP_BUILDS)); then
  echo "== prune static older than last ${KEEP_BUILDS} builds =="
  KEEP_LIST=$(mktemp)
  DROP_LIST=$(mktemp)
  for m in "${ALL_MANIFESTS[@]:0:KEEP_BUILDS}"; do cat "$m"; done | sort -u > "$KEEP_LIST"
  for m in "${ALL_MANIFESTS[@]:KEEP_BUILDS}"; do
    cat "$m"
    rm -f "$m"
  done | sort -u > "$DROP_LIST"
  # Files only in dropped manifests
  comm -23 "$DROP_LIST" "$KEEP_LIST" | while read -r rel; do
    [[ -n "$rel" ]] || continue
    rm -f "${STATIC_ROOT}/${rel}"
  done
  rm -f "$KEEP_LIST" "$DROP_LIST"
  # Clean empty dirs
  find "${STATIC_ROOT}" -type d -empty -delete 2>/dev/null || true
  mkdir -p "${STATIC_ROOT}/.builds"
fi

echo "== point nginx at static-assets =="
CONF=$(grep -RIl "blablablarden\|proxy_pass.*3000" /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | head -1 || true)
if [[ -z "${CONF:-}" ]]; then
  echo "FATAL: nginx site config not found"
  exit 1
fi
cp -a "$CONF" "${CONF}.bak.$(date +%F-%H%M%S)"
python3 - "$CONF" "${STATIC_ROOT}/" <<'PY'
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
if pat.search(text):
    text, n = pat.subn(block + "\n", text, count=1)
    print(f"OK: rewrote /_next/static/ → {alias}")
else:
    idx = text.find("location / {")
    if idx < 0:
        idx = text.find("location /{")
    if idx < 0:
        raise SystemExit("location / not found")
    text = text[:idx] + block + "\n" + text[idx:]
    print(f"OK: inserted /_next/static/ → {alias}")
conf.write_text(text)
PY

python3 - "$CONF" <<'PY'
from pathlib import Path
import re
import sys

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
    text, n = pat.subn(block + "\n", text, count=1)
    print("OK: rewrote /uploads/ → root public (no alias+try_files)")
else:
    idx = text.find("location / {")
    if idx < 0:
        idx = text.find("location /{")
    if idx < 0:
        raise SystemExit("location / not found for uploads insert")
    text = text[:idx] + block + "\n" + text[idx:]
    print("OK: inserted /uploads/ location")
conf.write_text(text)
PY

nginx -t
systemctl reload nginx

echo "== atomic swap .next =="
# Old server process can keep running until we restart; assets already in STATIC_ROOT.
rm -rf .next-previous
if [[ -d .next ]]; then
  mv .next .next-previous
fi
mv "${BUILD_DIR}" .next

echo "== restart app =="
# Free port cleanly, then start from ecosystem (cwd=/var/www/blabla, reads .next)
pm2 delete blabla 2>/dev/null || true
pkill -9 -f next-server 2>/dev/null || true
fuser -k 3000/tcp 2>/dev/null || true
sleep 1
pm2 start ecosystem.config.cjs
pm2 save
sleep 2

echo "== verify =="
CSS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://blablablarden.ru/_next/static/css/${CSS_NAME}")
echo "CSS HTTP ${CSS_CODE} (need 200)"
HTML_CSS=$(curl -s "https://blablablarden.ru/" | grep -oE '/_next/static/css/[^"]+\.css' | head -1 || true)
echo "HTML references: ${HTML_CSS:-none}"
if [[ "$CSS_CODE" != "200" ]]; then
  echo "FATAL: CSS not reachable via domain"
  curl -sI "http://127.0.0.1:3000/_next/static/css/${CSS_NAME}" | head -8 || true
  ls -la "${STATIC_ROOT}/css/${CSS_NAME}" || true
  exit 1
fi
if [[ -n "$HTML_CSS" && "$HTML_CSS" != "/_next/static/css/${CSS_NAME}" ]]; then
  echo "WARN: HTML CSS name differs from build (${HTML_CSS}) — check for multiple Next processes"
fi

DOC_CHUNK=$(find .next/static/chunks/app/documents -name 'page-*.js' 2>/dev/null | head -1 || true)
if [[ -n "${DOC_CHUNK:-}" ]]; then
  REL=${DOC_CHUNK#*.next/static/}
  ENC=$(python3 -c "import urllib.parse; print(urllib.parse.quote('''$REL''', safe='/.-'))")
  echo "DOC_CHUNK HTTP $(curl -s -o /dev/null -w '%{http_code}' "https://blablablarden.ru/_next/static/$ENC")"
fi

echo
echo "Release ${BUILD_ID} OK."
echo "Do not deploy with ad-hoc 'rm -rf .next && npm run build' — always use this script."
