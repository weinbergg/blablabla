#!/usr/bin/env bash
# Live health + traffic snapshot for blablablarden VPS.
# Works without a new app deploy — only needs shell access.
#
#   bash deploy/monitor.sh
#   bash deploy/monitor.sh --watch   # refresh every 30s
set -euo pipefail

ROOT="${ROOT:-/var/www/blabla}"
WATCH=0
[[ "${1:-}" == "--watch" ]] && WATCH=1

pick_access_log() {
  local candidates=(
    /var/log/nginx/access.log
    /var/log/nginx/blablablarden.access.log
    /var/log/nginx/blabla.access.log
  )
  local f
  for f in "${candidates[@]}"; do
    if [[ -r "$f" ]]; then
      echo "$f"
      return
    fi
  done
  # Fall back to whatever nginx mentions for our site.
  local conf
  conf=$(grep -RIl "blablablarden\|proxy_pass.*3000" /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | head -1 || true)
  if [[ -n "${conf:-}" ]]; then
    local mentioned
    mentioned=$(grep -E "access_log\s+" "$conf" | grep -v "off" | awk '{print $2}' | tr -d ';' | head -1 || true)
    if [[ -n "${mentioned:-}" && -r "$mentioned" ]]; then
      echo "$mentioned"
      return
    fi
  fi
  echo ""
}

snapshot() {
  local now log
  now=$(date '+%Y-%m-%d %H:%M:%S %Z')
  log=$(pick_access_log)

  echo "======== blablablarden monitor · ${now} ========"
  echo
  echo "-- load / memory / disk --"
  uptime || true
  free -h 2>/dev/null || true
  df -h / "${ROOT}" 2>/dev/null | awk 'NR==1 || /\/$|blabla/' || df -h / | head -2
  echo
  echo "-- pm2 --"
  if command -v pm2 >/dev/null 2>&1; then
    pm2 jlist 2>/dev/null | python3 - <<'PY' 2>/dev/null || pm2 status
import json, sys
try:
    apps = json.load(sys.stdin)
except Exception:
    sys.exit(1)
for app in apps:
    if app.get("name") != "blabla":
        continue
    m = app.get("monit") or {}
    env = (app.get("pm2_env") or {})
    print(f"  status={env.get('status')}  restarts={env.get('restart_time')}  cpu={m.get('cpu')}%  mem={round((m.get('memory') or 0)/1024/1024)}MB  uptime_ms={env.get('pm_uptime') and ( __import__('time').time()*1000 - env.get('pm_uptime')):.0f}")
PY
  else
    echo "  pm2 not found"
  fi
  echo
  echo "-- app process (port 3000) --"
  ss -ltnp 2>/dev/null | grep ':3000' || netstat -ltnp 2>/dev/null | grep ':3000' || echo "  (port 3000 not listening?)"
  echo
  echo "-- sqlite users (registered) --"
  if [[ -r "${ROOT}/data/app.db" ]]; then
    sqlite3 "${ROOT}/data/app.db" "SELECT '  users=' || COUNT(*) FROM users; SELECT '  sessions_active=' || COUNT(*) FROM sessions WHERE expires_at > datetime('now');" 2>/dev/null || echo "  (sqlite3 failed)"
  else
    echo "  db not readable at ${ROOT}/data/app.db"
  fi
  echo
  if [[ -z "$log" ]]; then
    echo "-- nginx access log --"
    echo "  not found / not readable. Try: sudo bash deploy/monitor.sh"
    echo "  or: sudo tail -n 200 /var/log/nginx/access.log"
  else
    echo "-- traffic from ${log} --"
    # Unique IPs + hits in last 60 / 1440 minutes (wall-clock filter via awk).
    python3 - "$log" <<'PY'
import sys, re
from collections import Counter
from datetime import datetime, timedelta, timezone

path = sys.argv[1]
# Common combined log: IP - - [01/Aug/2026:12:00:00 +0000] "GET / HTTP/1.1" 200 ...
pat = re.compile(
    r'^(?P<ip>\S+)\s+\S+\s+\S+\s+\[(?P<ts>[^\]]+)\]\s+"(?P<req>[^"]*)"\s+(?P<status>\d+)'
)
months = {m: i for i, m in enumerate(
    "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(), 1)}

def parse_ts(s: str):
    # 01/Aug/2026:12:00:00 +0000
    try:
        day, mon, rest = s.split("/")
        year_time, tz = rest.split(" ", 1)
        year, hms = year_time.split(":", 1)
        dt = datetime(
            int(year), months[mon], int(day),
            *map(int, hms.split(":")),
            tzinfo=timezone.utc,
        )
        return dt
    except Exception:
        return None

now = datetime.now(timezone.utc)
windows = {
    "1h": now - timedelta(hours=1),
    "24h": now - timedelta(hours=24),
}
hits = {k: 0 for k in windows}
ips = {k: set() for k in windows}
status = {k: Counter() for k in windows}
paths = {k: Counter() for k in windows}
bots = re.compile(r"bot|crawl|spider|bingpreview|facebookexternalhit|python-requests|curl/", re.I)
ua_bots = {k: 0 for k in windows}

# Read last ~200k lines without loading whole multi-GB logs when possible.
try:
    import subprocess
    raw = subprocess.check_output(["tail", "-n", "200000", path], text=True, errors="replace")
    lines = raw.splitlines()
except Exception:
    with open(path, "r", errors="replace") as f:
        lines = f.readlines()[-200000:]

for line in lines:
    m = pat.match(line)
    if not m:
        continue
    dt = parse_ts(m.group("ts"))
    if not dt:
        continue
    ip = m.group("ip")
    status_code = m.group("status")
    req = m.group("req")
    method_path = req.split(" ")
    p = method_path[1] if len(method_path) >= 2 else "?"
    # Strip query
    p = p.split("?", 1)[0]
    if p.startswith("/_next/") or p.startswith("/uploads/"):
        pageish = False
    else:
        pageish = True
    for label, since in windows.items():
        if dt < since:
            continue
        hits[label] += 1
        ips[label].add(ip)
        status[label][status_code] += 1
        if pageish and not p.startswith("/api/"):
            paths[label][p] += 1

print(f"  last 1h : {hits['1h']} requests, {len(ips['1h'])} unique IPs")
print(f"  last 24h: {hits['24h']} requests, {len(ips['24h'])} unique IPs")
print(f"  statuses 1h : {dict(status['1h'].most_common(6))}")
print(f"  statuses 24h: {dict(status['24h'].most_common(6))}")
print("  top pages 24h:")
for p, n in paths["24h"].most_common(12):
    print(f"    {n:5d}  {p}")
PY
  fi
  echo
  echo "-- quick HTTP check --"
  curl -sS -o /dev/null -w "  / → HTTP %{http_code} in %{time_total}s\n" --max-time 8 "http://127.0.0.1:3000/" || echo "  local :3000 failed"
  curl -sS -o /dev/null -w "  public CSS probe → HTTP %{http_code}\n" --max-time 8 "https://blablablarden.ru/" || true
  echo "===================================================="
}

if [[ "$WATCH" -eq 1 ]]; then
  while true; do
    clear || true
    snapshot
    sleep 30
  done
else
  snapshot
fi
