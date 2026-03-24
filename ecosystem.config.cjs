/**
 * Run API + worker + scheduler under PM2 (auto-restart, separate log labels).
 *
 * Docker / Coolify: `npx pm2-runtime start ecosystem.config.cjs`
 * VPS:            `npm run build && npx pm2 start ecosystem.config.cjs`
 */
const path = require("path");
const root = path.resolve(__dirname);

module.exports = {
  apps: [
    {
      name: "ucg-api",
      cwd: root,
      script: "dist/index.js",
      instances: 1,
      // Cluster mode breaks many workers (BullMQ / ioredis). Use fork for all.
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 50,
      min_uptime: "5s",
    },
    {
      name: "ucg-worker",
      cwd: root,
      script: "dist/workers/scraperWorker.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 50,
      min_uptime: "5s",
    },
    {
      name: "ucg-scheduler-posts",
      cwd: root,
      script: "dist/jobs/schedulerPostsOnly.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 50,
      min_uptime: "5s",
    },
  ],
};
