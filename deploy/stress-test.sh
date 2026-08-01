#!/usr/bin/env bash
# Lightweight load probe for blablablarden before a stream.
# Prefer hitting localhost from the VPS (less noise, same Node pressure).
#
#   bash deploy/stress-test.sh
#   bash deploy/stress-test.sh --browse -c 30 -n 600
#   bash deploy/stress-test.sh --url http://127.0.0.1:3000 --concurrency 20 --requests 400
#   bash deploy/stress-test.sh --url https://blablablarden.ru --concurrency 30 --requests 600
#
# If the site dies mid-test, see recovery block at the bottom of --help.
set -euo pipefail

URL="http://127.0.0.1:3000"
CONCURRENCY=15
REQUESTS=300
# default = mixed; --browse ≈ anonymous catalog + book pages (no auth)
PROFILE="mixed"
PATHS=("/" "/api/status" "/register" "/catalog/matematika" "/graph" "/login")

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url) URL="$2"; shift 2 ;;
    --concurrency|-c) CONCURRENCY="$2"; shift 2 ;;
    --requests|-n) REQUESTS="$2"; shift 2 ;;
    --browse)
      PROFILE="browse"
      PATHS=(
        "/"
        "/catalog/matematika"
        "/catalog/matematika/algebra"
        "/catalog/matematika/analiz"
        "/catalog/filosofiya"
        "/catalog/filosofiya/filosofiya-nauki"
        "/graph"
        "/tags"
        # real document ids from prod catalog samples
        "/documents/f415a824-bdd1-4eee-bac8-ff6bafa3346a"
        "/documents/9534646a-9aa3-40af-a0fd-545cf71b5e5e"
        "/documents/200a8b72-ae0e-42b8-ae33-a33a3b6b8230"
      )
      shift
      ;;
    --help|-h)
      sed -n '2,12p' "$0"
      cat <<'EOF'

Recovery if pm2/errored / EADDRINUSE:
  cd /var/www/blabla
  pm2 delete blabla 2>/dev/null
  pkill -f 'next-server' 2>/dev/null || true
  fuser -k 3000/tcp 2>/dev/null || true
  pm2 start ecosystem.config.cjs && pm2 save
  curl -sI http://127.0.0.1:3000/ | head -3

Optional maintenance cloak while recovering:
  bash scripts/maintenance.sh on "минута"
  # …recovery…
  bash scripts/maintenance.sh off
EOF
      exit 0
      ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

URL="${URL%/}"
WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

echo "== stress-test =="
echo "  target:       $URL"
echo "  profile:      $PROFILE"
echo "  concurrency:  $CONCURRENCY"
echo "  requests:     $REQUESTS"
echo "  paths:        ${PATHS[*]}"
echo

# Warmup
for p in "${PATHS[@]}"; do
  code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 15 "${URL}${p}" || echo "000")
  echo "  warmup ${p} → HTTP ${code}"
done
echo

START=$(date +%s)
# One URL per line for xargs
: >"$WORKDIR/urls.txt"
for ((i = 0; i < REQUESTS; i++)); do
  p="${PATHS[$((i % ${#PATHS[@]}))]}"
  echo "${URL}${p}" >>"$WORKDIR/urls.txt"
done

# Each line → curl; collect code and time
xargs -P "$CONCURRENCY" -n 1 -a "$WORKDIR/urls.txt" \
  curl -sS -o /dev/null -w "%{http_code} %{time_total}\n" --max-time 20 \
  >"$WORKDIR/results.txt" 2>"$WORKDIR/errors.txt" || true

END=$(date +%s)
ELAPSED=$((END - START))
[[ "$ELAPSED" -lt 1 ]] && ELAPSED=1

python3 - "$WORKDIR/results.txt" "$WORKDIR/errors.txt" "$REQUESTS" "$ELAPSED" <<'PY'
import sys
from collections import Counter
from pathlib import Path

results = Path(sys.argv[1]).read_text(errors="replace").splitlines()
err_text = Path(sys.argv[2]).read_text(errors="replace").strip()
planned = int(sys.argv[3])
elapsed = int(sys.argv[4])

codes = Counter()
times = []
for line in results:
    parts = line.strip().split()
    if len(parts) < 2:
        continue
    codes[parts[0]] += 1
    try:
        times.append(float(parts[1]))
    except ValueError:
        pass

ok = sum(v for k, v in codes.items() if k.startswith("2") or k.startswith("3"))
fail = sum(v for k, v in codes.items() if not (k.startswith("2") or k.startswith("3")))
times_sorted = sorted(times)
def pct(p):
    if not times_sorted:
        return 0
    i = min(len(times_sorted) - 1, int(len(times_sorted) * p))
    return times_sorted[i]

print("-- results --")
print(f"  completed lines: {len(results)} / planned {planned}")
print(f"  wall time:       {elapsed}s  (~{len(results)/elapsed:.1f} req/s)")
print(f"  OK (2xx/3xx):    {ok}")
print(f"  failed:          {fail}")
print(f"  status counts:   {dict(codes)}")
if times_sorted:
    print(f"  latency avg:     {sum(times_sorted)/len(times_sorted):.3f}s")
    print(f"  latency p50:     {pct(0.50):.3f}s")
    print(f"  latency p95:     {pct(0.95):.3f}s")
    print(f"  latency max:     {times_sorted[-1]:.3f}s")
if err_text:
    print("-- curl stderr (truncated) --")
    print("\n".join(err_text.splitlines()[:12]))

print()
if fail > planned * 0.05 or (times_sorted and pct(0.95) > 3):
    print("VERDICT: VPS already struggling — for a ~1000-person stream expect pain.")
    print("         Prefer lighter pages; keep monitor.sh open; recovery commands in --help.")
elif fail == 0 and (not times_sorted or pct(0.95) < 1.5):
    print("VERDICT: light probe OK. Ramp concurrency (30–50) once more before the stream.")
else:
    print("VERDICT: mixed — site alive but slowing. Watch RAM/load during the real stream.")
PY

echo
echo "Host snapshot:"
uptime || true
free -h 2>/dev/null | head -2 || true
pm2 status 2>/dev/null || true
