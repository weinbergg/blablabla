#!/usr/bin/env bash
# Stop only these transient test units. Keep files/database for review.
set -euo pipefail
test "$(id -u)" = 0
systemctl stop blabla-test-tunnel.service || test "$(systemctl show -p LoadState --value blabla-test-tunnel.service)" = not-found
systemctl stop blabla-test.service || test "$(systemctl show -p LoadState --value blabla-test.service)" = not-found
ss -ltnp '( sport = :3001 or sport = :3301 or sport = :3302 )'
echo 'Test units stopped; data retained. Production PM2 was not called.'
