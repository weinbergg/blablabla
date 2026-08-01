/**
 * PM2 process file. Prefer this over `pm2 start npm -- start`: npm wraps
 * Next.js and leaves orphan `next-server` processes holding port 3000 after
 * restarts, which then makes every subsequent start fail with EADDRINUSE.
 *
 * Usage on the VPS:
 *   pm2 delete blabla 2>/dev/null
 *   pkill -f 'next-server' 2>/dev/null
 *   fuser -k 3000/tcp 2>/dev/null
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 *
 * Maintenance flags are read from data/maintenance.json so
 * `bash scripts/maintenance.sh on|off|warn` can flip them via pm2 restart.
 */
const fs = require("fs");
const path = require("path");

let maintenance = {
  MAINTENANCE_MODE: "0",
  MAINTENANCE_MESSAGE: "",
  MAINTENANCE_ETA: "",
  MAINTENANCE_WARN_UNTIL: "",
};
try {
  const raw = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data", "maintenance.json"), "utf8"),
  );
  maintenance = {
    MAINTENANCE_MODE: raw.locked ? "1" : "0",
    MAINTENANCE_MESSAGE: raw.message || "",
    MAINTENANCE_ETA: raw.eta || "",
    MAINTENANCE_WARN_UNTIL: raw.warnUntil || "",
  };
} catch {
  /* no file yet — site open */
}

module.exports = {
  apps: [
    {
      name: "blabla",
      cwd: "/var/www/blabla",
      script: "node_modules/next/dist/bin/next",
      args: "start",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 8,
      min_uptime: "5s",
      kill_timeout: 8000,
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        HOSTNAME: "127.0.0.1",
        ...maintenance,
      },
    },
  ],
};
