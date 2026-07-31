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
 */
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
        // Bind explicitly; nginx proxies to 127.0.0.1:3000
        HOSTNAME: "127.0.0.1",
      },
    },
  ],
};
