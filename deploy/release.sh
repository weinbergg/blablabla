#!/usr/bin/env bash
# Offline checks, plus the explicit owner-operated one-off release kit.
set -euo pipefail
APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_ROOT"
case "${1:-}" in
  --prepare|--prepare-git|--apply-approved-production|--rollback|--status)
    if [ "$(uname -s)" != Linux ] || [ "$(id -u)" != 0 ] || { [ "$APP_ROOT" != /srv/blabla-release-qhq2Vhh0/production-tools ] && [ "$APP_ROOT" != /srv/blabla-release-qhq2Vhh0/git-source ]; }; then
      echo 'STOP: эта операция доступна только из проверенного пакета на VPS под root.' >&2
      exit 2
    fi
    if [ "$1" = --prepare-git ]; then
      if [ "$#" -ne 2 ] || [[ ! "$2" =~ ^[0-9a-f]{40}$ ]] || [ "$APP_ROOT" != /srv/blabla-release-qhq2Vhh0/git-source ]; then
        echo 'Usage on VPS: release.sh --prepare-git <full-commit-sha>' >&2; exit 2
      fi
      BLABLA_RELEASE_MEMORY=950M
      BLABLA_RELEASE_SWAP=768M
    else
      if [ "$#" -ne 1 ]; then exit 2; fi
      BLABLA_RELEASE_MEMORY=512M
      BLABLA_RELEASE_SWAP=128M
    fi
    umask 077
    if [ "$1" = --status ]; then
      exec /usr/bin/node deploy/production-update.cjs --status
    fi
    # systemd owns the operation: an SSH disconnect does not interrupt the switch.
    # flock releases on process exit, including OOM/SIGKILL; no stale PID locks.
    result=0
    systemd-run --unit=blabla-release-operation --collect --wait \
      --property=Type=exec --property=UMask=0077 \
      --property="MemoryMax=$BLABLA_RELEASE_MEMORY" --property="MemorySwapMax=$BLABLA_RELEASE_SWAP" \
      --property=MemoryOOMGroup=yes \
      --property=CPUQuota=100% --property=Nice=10 --property=IOWeight=10 --working-directory="$APP_ROOT" \
      /usr/bin/flock --nonblock /srv/blabla-release-qhq2Vhh0/production-update.lock \
      /usr/bin/env -i PATH=/usr/bin:/bin PM2_HOME=/root/.pm2 BLABLA_RELEASE_LOCKED=1 \
      /usr/bin/node deploy/production-update.cjs "$@" || result=$?
    journalctl -u blabla-release-operation -n 12 --no-pager
    exit "$result"
    ;;
esac
if [[ "${1:-}" != "--check" || ( "$#" -ne 4 && "$#" -ne 5 ) || ( "$#" -eq 5 && "$5" != "--bootstrap" ) ]]; then
  cat >&2 <<'MESSAGE'
Automatic deployment is disabled for this release.
The former script ran unverified schema changes and killed unrelated Next processes.
Read docs/release-preparation.md before scheduling a production update.
The private Git checkout supports --prepare-git <full-commit-sha>.
The installed private kit supports --prepare, --apply-approved-production,
--status and --rollback. A bare invocation never deploys.
Offline check only (no deploy, no production writes):
  bash deploy/release.sh --check /offline/source.db /reports /copied/app-root [--bootstrap]
MESSAGE
  exit 2
fi
shift
exec node --import tsx scripts/verify-release.ts "$@"
