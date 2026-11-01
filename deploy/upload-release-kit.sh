#!/usr/bin/env bash
# Owner runs this once on the Mac. Upload/install only: no production switch.
set -euo pipefail
if [ "$(uname -s)" != Darwin ]; then
  echo 'Запустите на Mac, вне SSH-сессии VPS.' >&2; exit 1
fi
BLABLA_KIT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
BLABLA_KIT_ARCHIVE="$BLABLA_KIT_ROOT/data/implementation-checks/production-release-kit.tar.gz"
BLABLA_KIT_SHA="$(awk '{print $1}' "$BLABLA_KIT_ARCHIVE.sha256")"
if [[ ! "$BLABLA_KIT_SHA" =~ ^[0-9a-f]{64}$ ]] || [ "$(shasum -a 256 "$BLABLA_KIT_ARCHIVE" | awk '{print $1}')" != "$BLABLA_KIT_SHA" ]; then
  echo 'STOP: checksum mismatch; nothing uploaded.' >&2; exit 1
fi
if [ "${1:-}" = --check ] && [ "$#" = 1 ]; then
  echo 'KIT_CHECK_OK: no network connection.'; exit 0
fi
if [ "$#" != 0 ]; then echo 'Usage: bash deploy/upload-release-kit.sh [--check]' >&2; exit 1; fi
echo 'Передаётся только release-скрипт и миграции. Основной сайт не переключается.'
scp "$BLABLA_KIT_ARCHIVE" "root@80.78.248.233:/srv/blabla-release-qhq2Vhh0/production-kit-$BLABLA_KIT_SHA.tar.gz"
# The only substituted argument is a validated hexadecimal checksum.
ssh root@80.78.248.233 "bash -s -- $BLABLA_KIT_SHA" <<'BLABLA_INSTALL_RELEASE'
set -euo pipefail
test "$(uname -s)" = Linux
test "$(id -u)" = 0
umask 077
cd /srv/blabla-release-qhq2Vhh0
test "$(stat -c '%u:%a' .)" = 0:700
if [ -e production-tools ] || [ -L production-tools ]; then
  echo 'STOP: release kit already installed; do not overwrite it.' >&2; exit 1
fi
printf '%s  %s\n' "$1" "production-kit-$1.tar.gz" | sha256sum -c -
BLABLA_INSTALL_DIR="$(mktemp -d /srv/blabla-release-qhq2Vhh0/production-install-XXXXXXXX)"
tar --no-same-owner -xzf "production-kit-$1.tar.gz" -C "$BLABLA_INSTALL_DIR"
(cd "$BLABLA_INSTALL_DIR" && sha256sum -c SHA256SUMS)
mv "$BLABLA_INSTALL_DIR" production-tools
echo 'RELEASE_KIT_INSTALLED. В Termius:'
echo 'bash /srv/blabla-release-qhq2Vhh0/production-tools/deploy/release.sh --prepare'
BLABLA_INSTALL_RELEASE
