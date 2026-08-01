#!/usr/bin/env bash
# Toggle maintenance window (writes data/maintenance.json, restarts pm2 with env).
#
#   bash scripts/maintenance.sh warn 15 "около 15 минут"
#   bash scripts/maintenance.sh on "около 20 минут"
#   bash scripts/maintenance.sh off
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p data

until_iso_plus() {
  local minutes="$1"
  if date -u -d "+${minutes} minutes" +%Y-%m-%dT%H:%M:%SZ >/dev/null 2>&1; then
    date -u -d "+${minutes} minutes" +%Y-%m-%dT%H:%M:%SZ
  else
    date -u -v+"${minutes}M" +%Y-%m-%dT%H:%M:%SZ
  fi
}

write_json() {
  local locked="$1" message="$2" eta="$3" warnUntil="$4"
  python3 - "$ROOT/data/maintenance.json" "$locked" "$message" "$eta" "$warnUntil" <<'PY'
import json, sys
path, locked, message, eta, warn = sys.argv[1:6]
data = {
  "locked": locked == "1",
  "message": message,
  "eta": eta or None,
  "warnUntil": warn or None,
}
with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
    f.write("\n")
print(json.dumps(data, ensure_ascii=False))
PY
}

cmd="${1:-}"
case "$cmd" in
  warn)
    minutes="${2:-10}"
    eta="${3:-около ${minutes} минут}"
    until_iso=$(until_iso_plus "$minutes")
    write_json 0 "Скоро технические работы. Сохраните пометки — сайт ненадолго закроется." "$eta" "$until_iso"
    echo "WARNING until $until_iso"
    ;;
  on)
    eta="${2:-скоро вернёмся}"
    write_json 1 "Сейчас на сайте технические работы: обновляю библиотеку. Это не сбой — скоро всё снова откроется." "$eta" ""
    echo "MAINTENANCE ON"
    ;;
  off)
    write_json 0 "" "" ""
    echo "MAINTENANCE OFF"
    ;;
  *)
    echo "Usage:"
    echo "  bash scripts/maintenance.sh warn 15 'около 15 минут'"
    echo "  bash scripts/maintenance.sh on 'около 20 минут'"
    echo "  bash scripts/maintenance.sh off"
    exit 1
    ;;
esac

# Re-read ecosystem.config.cjs (pulls data/maintenance.json into env for middleware)
if command -v pm2 >/dev/null 2>&1; then
  pm2 startOrReload ecosystem.config.cjs --update-env
  echo "pm2 reloaded with maintenance env"
else
  echo "pm2 not found — restart Next so MAINTENANCE_* env reloads"
fi
