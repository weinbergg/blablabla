#!/usr/bin/env bash
# Run by the owner on their Mac. This transfers a small kit, never a release.
set -euo pipefail
if [ "$(uname -s)" != Darwin ]; then
  echo 'Запустите эту команду в терминале Mac, вне SSH-сессии VPS.' >&2
  exit 1
fi
BLABLA_KIT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
BLABLA_KIT_ARCHIVE="$BLABLA_KIT_ROOT/data/implementation-checks/release-legacy-20261029.tar.gz"
BLABLA_KIT_SHA=c811e4a380197c747eb684678a44e7f261071e084ea93ff509b5acb464d58a3f
test -f "$BLABLA_KIT_ARCHIVE"
if [ "$(shasum -a 256 "$BLABLA_KIT_ARCHIVE" | awk '{print $1}')" != "$BLABLA_KIT_SHA" ]; then
  echo 'STOP: checksum mismatch; nothing uploaded.' >&2
  exit 1
fi
if [ "${1:-}" = --check ] && [ "$#" = 1 ]; then
  echo 'KIT_CHECK_OK: verified locally; no network connection.'
  exit 0
fi
if [ "$#" != 0 ]; then echo 'Usage: bash deploy/rehearse-production-copy.sh [--check]' >&2; exit 1; fi
echo 'Передача небольшого пакета и проверка сохранённой копии SQLite. Production не переключается.'
echo 'SSH может дважды запросить пароль VPS; вводите его только в терминале.'
scp "$BLABLA_KIT_ARCHIVE" root@80.78.248.233:/srv/blabla-release-qhq2Vhh0/rehearsal-kit-c811e4a3.tar.gz
ssh root@80.78.248.233 'bash -s' <<'BLABLA_REMOTE_REHEARSAL'
set -euo pipefail
test "$(uname -s)" = Linux
test "$(id -u)" = 0
umask 077
cd /srv/blabla-release-qhq2Vhh0
printf '%s  %s\n' 'c811e4a380197c747eb684678a44e7f261071e084ea93ff509b5acb464d58a3f' 'rehearsal-kit-c811e4a3.tar.gz' | sha256sum -c -
BLABLA_TOOLS_DIR="$(mktemp -d /srv/blabla-release-qhq2Vhh0/rehearsal-tools-XXXXXXXX)"
tar --no-same-owner -xzf rehearsal-kit-c811e4a3.tar.gz -C "$BLABLA_TOOLS_DIR"
bash "$BLABLA_TOOLS_DIR/deploy/rehearse-copy.sh"
BLABLA_REMOTE_REHEARSAL
