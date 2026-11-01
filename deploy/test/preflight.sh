#!/usr/bin/env bash
# Read-only. Owner runs through Termius. No SSH, app import or PM2 CLI/daemon calls.
set -eu
printf '\nOS / architecture / cgroups\n'
uname -m
cat /etc/os-release
systemctl --version | head -1
stat -fc %T /sys/fs/cgroup
cat /sys/fs/cgroup/cgroup.controllers 2>/dev/null || true
printf '\nMemory / swap / disk / load\n'
free -m
df -h / /srv /var/www/blabla
uptime
printf '\nExecutable paths (no environment values)\n'
for program in node npm pm2-runtime cloudflared; do
  target=$(command -v "$program" || true)
  printf '%s: %s\n' "$program" "${target:-MISSING}"
  if [ -n "$target" ]; then readlink -f "$target"; fi
done
node --version
cloudflared --version 2>/dev/null || true
printf '\nPorts 3001 / 3301 / 3302: expected EMPTY\n'
ss -ltnp '( sport = :3001 or sport = :3301 or sport = :3302 )'
printf '\nExisting test paths/account: expected absent on first run\n'
ls -ld /srv/blabla-test 2>/dev/null || true
getent passwd blabla-test || true
printf '\nLargest processes (RSS KiB; no arguments/secrets)\n'
ps -eo pid,user,rss,comm --sort=-rss | head -10
printf '\nNo changes made. Send this report before creating or starting the test instance.\n'
