#!/usr/bin/env bash
# Import curated literature/Библиотека tree on the VPS after rsync.
# Preserves folder hierarchy: existing sections absorb matches; missing
# nested folders (and, with --create-top-level, root folders) are created.
set -euo pipefail
APP_ROOT=/var/www/blabla
SRC="${1:-$APP_ROOT/import-staging/Библиотека}"

cd "$APP_ROOT"
if [[ ! -d "$SRC" ]]; then
  echo "Нет папки: $SRC"
  echo "Сначала с Mac:"
  echo "  rsync -avz --progress \\"
  echo "    \"/Users/georgij/Desktop/blabla/литература/Библиотека/\" \\"
  echo "    deploy@80.78.248.233:/var/www/blabla/import-staging/Библиотека/"
  exit 1
fi

echo "Import from $SRC"
npx tsx scripts/bulk-import.ts "$SRC" \
  --create-top-level \
  --label "Библиотека $(date +%F)"

echo
echo "Готово. Проверьте каталог на сайте. При необходимости:"
echo "  pm2 startOrReload ecosystem.config.cjs --update-env"
