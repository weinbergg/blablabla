#!/usr/bin/env bash
# Owner-operated, read-only source + migrations on a newly restored private DB.
set -euo pipefail
test "$(uname -s)" = Linux
test "$(id -u)" = 0
umask 077
BLABLA_CHECK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
case "$BLABLA_CHECK_ROOT" in
  /srv/blabla-release-qhq2Vhh0/rehearsal-tools-*) ;;
  *) echo 'STOP: run only from the private release rehearsal directory.' >&2; exit 1 ;;
esac
cd "$BLABLA_CHECK_ROOT"
test -f /srv/blabla-release-qhq2Vhh0/blabla-backup-DkuxrS/backup.db
test -d /srv/blabla-test/app/node_modules
test ! -e node_modules
test ! -L node_modules
ln -s /srv/blabla-test/app/node_modules node_modules
echo 'Checking restored database and referenced files; original database is not opened.'
# Bound memory/CPU and lower I/O priority. No Next server or app workers are started.
systemd-run --scope --quiet \
  --property=MemoryMax=512M --property=MemorySwapMax=128M --property=CPUQuota=50% \
  /usr/bin/env -i PATH=/usr/bin:/bin \
  /usr/bin/nice -n 10 /usr/bin/ionice -c 3 /usr/bin/node --import tsx \
  scripts/verify-release.ts \
  /srv/blabla-release-qhq2Vhh0/blabla-backup-DkuxrS/backup.db \
  /srv/blabla-release-qhq2Vhh0 /var/www/blabla --legacy-baseline --bootstrap
echo 'REHEARSAL_OK'
