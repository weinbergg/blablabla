#!/usr/bin/env bash
# Owner only, AFTER preflight review + Linux artifact verification + initialization.
set -euo pipefail
if [ "${1:-}" != '--reviewed-preflight' ] || [ "$#" != 3 ]; then
  echo 'Usage: bash deploy/test/start.sh --reviewed-preflight /absolute/node /absolute/pm2-runtime'; exit 1
fi
test "$(id -u)" = 0
test "$(realpath "$(dirname "$0")/../..")" = /srv/blabla-test/app
test "$(stat -fc %T /sys/fs/cgroup)" = cgroup2fs
grep -qw memory /sys/fs/cgroup/cgroup.controllers
available_kib=$(awk '/MemAvailable/{print $2}' /proc/meminfo)
# 750 MiB app/PM2/gate + 128 MiB tunnel + 322 MiB headroom = 1200 MiB.
if [ "$available_kib" -lt 1228800 ]; then
  echo "Test not started: available RAM is $((available_kib / 1024)) MiB; at least 1200 MiB required. Keep the limit; stop and review current load."; exit 1
fi
if [ "$(awk '/SwapFree/{print $2}' /proc/meminfo)" -lt 524288 ]; then echo 'Test not started: free swap below 512 MiB'; exit 1; fi
if [ "$(df --output=avail -k /srv/blabla-test | tail -1)" -lt 2097152 ]; then echo 'Test not started: free disk below 2 GiB'; exit 1; fi
for port in 3001 3301; do
  if [ -n "$(ss -H -ltn "sport = :$port")" ]; then echo "Test not started: port $port is already in use"; exit 1; fi
done
node_bin=$(realpath "$2")
pm2_bin=$(realpath "$3")
case "$node_bin:$pm2_bin" in *'/root/'*|*'/var/www/blabla/'*) echo 'Runtime must be accessible outside root home and production'; exit 1;; esac
runuser -u blabla-test -- test -x "$node_bin"
runuser -u blabla-test -- test -r "$pm2_bin"
cd /srv/blabla-test/app
runuser -u blabla-test -- env -i PATH="$(dirname "$node_bin"):/usr/bin:/bin" "$node_bin" -e 'require("./deploy/test/paths.cjs").testRoot(process.cwd())'
# Separate foreground PM2 daemon; never calls root's production PM2 or pm2 save.
systemd-run --unit=blabla-test --collect --service-type=exec \
  --property=User=blabla-test --property=Group=blabla-test \
  --property=WorkingDirectory=/srv/blabla-test/app \
  --property=MemoryHigh=550M --property=MemoryMax=750M --property=MemorySwapMax=256M \
  --property=CPUQuota=75% --property=CPUWeight=20 --property=Nice=10 --property=TasksMax=128 --property=OOMPolicy=kill \
  --property=KillMode=control-group --property=TimeoutStopSec=20 \
  --property=ProtectSystem=strict --property=ProtectHome=yes --property=PrivateTmp=yes \
  --property=NoNewPrivileges=yes --property=InaccessiblePaths=/var/www/blabla \
  --property=ReadWritePaths=/srv/blabla-test \
  /usr/bin/env -i PATH="$(dirname "$node_bin"):/usr/bin:/bin" HOME=/srv/blabla-test \
  PM2_HOME=/srv/blabla-test/pm2 NEXT_TELEMETRY_DISABLED=1 \
  "$node_bin" "$pm2_bin" start /srv/blabla-test/app/deploy/test/ecosystem.config.cjs
echo 'Check systemctl status blabla-test and unauthenticated gate HTTP 401 before starting a tunnel.'
