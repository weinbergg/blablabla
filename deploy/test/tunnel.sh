#!/usr/bin/env bash
set -euo pipefail
if [ "${1:-}" != '--gate-verified' ] || [ "$#" != 2 ]; then echo 'Usage: bash deploy/test/tunnel.sh --gate-verified /absolute/cloudflared'; exit 1; fi
test "$(id -u)" = 0
test "$(realpath "$(dirname "$0")/../..")" = /srv/blabla-test/app
systemctl is-active --quiet blabla-test
test "$(curl --max-time 5 -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3301/)" = 401
test -z "$(ss -H -ltn 'sport = :3302')"
cloudflared_bin=$(realpath "$2")
case "$cloudflared_bin" in /root/*|/var/www/blabla/*) echo 'Use a separate accessible cloudflared executable'; exit 1;; esac
runuser -u blabla-test -- test -x "$cloudflared_bin"
systemd-run --unit=blabla-test-tunnel --collect --service-type=exec \
  --property=User=blabla-test --property=Group=blabla-test \
  --property=BindsTo=blabla-test.service --property=After=blabla-test.service \
  --property=WorkingDirectory=/srv/blabla-test \
  --property=MemoryMax=128M --property=MemorySwapMax=64M --property=CPUQuota=25% \
  --property=TasksMax=64 --property=OOMPolicy=kill --property=KillMode=control-group \
  --property=ProtectSystem=strict --property=ProtectHome=yes --property=PrivateTmp=yes \
  --property=NoNewPrivileges=yes --property=InaccessiblePaths=/var/www/blabla \
  /usr/bin/env -i HOME=/srv/blabla-test PATH=/usr/bin:/bin \
  "$cloudflared_bin" tunnel --no-autoupdate --metrics 127.0.0.1:3302 --url http://127.0.0.1:3301
echo 'Read the temporary HTTPS URL with journalctl -u blabla-test-tunnel -n 30 --no-pager'
