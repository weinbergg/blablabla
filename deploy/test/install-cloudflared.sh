#!/usr/bin/env bash
# Owner-run, after artifact extraction. Installs ONLY a private test binary, no service/APT changes.
set -euo pipefail
test "$(id -u)" = 0
test "$(uname -m)" = x86_64
test "$(realpath "$(dirname "$0")/../..")" = /srv/blabla-test/app
test "$(realpath /srv/blabla-test)" = /srv/blabla-test
test -d /srv/blabla-test/incoming
test ! -e /srv/blabla-test/bin/cloudflared
version=2026.10.3
expected=053b80b0a23031a038fdbf3c073f59f82b8f1f152aa67971d7383ffafc0dbab0
download=$(mktemp /srv/blabla-test/incoming/cloudflared.XXXXXX)
trap 'rm -f -- "$download"' EXIT
curl --fail --location --proto '=https' --tlsv1.2 --retry 2 --connect-timeout 20 --max-time 180 \
  "https://github.com/cloudflare/cloudflared/releases/download/$version/cloudflared-linux-amd64" --output "$download"
printf '%s  %s\n' "$expected" "$download" | sha256sum --check --status
install -d -m 755 -o root -g root /srv/blabla-test/bin
install -m 755 -o root -g root "$download" /srv/blabla-test/bin/cloudflared
runuser -u blabla-test -- /srv/blabla-test/bin/cloudflared --version
echo 'Verified private binary installed. No tunnel or system service started.'
