/**
 * Run API + worker + scheduler under PM2 (auto-restart, separate log labels).
 *
 * Docker / Coolify: `npx pm2-runtime start ecosystem.config.cjs`
 * VPS:            `npm run build && npx pm2 start ecosystem.config.cjs`
 */
module.exports = {
  apps: [
    {
      name: "ucg-api",
      script: "dist/index.js",
      instances: 1,
      autorestart: true,
      max_restarts: 50,
      min_uptime: "5s",
    },
    {
      name: "ucg-worker",
      script: "dist/workers/scraperWorker.js",
      instances: 1,
      autorestart: true,
      max_restarts: 50,
      min_uptime: "5s",
    },
    {
      name: "ucg-scheduler-posts",
      script: "dist/jobs/schedulerPostsOnly.js",
      instances: 1,
      autorestart: true,
      max_restarts: 50,
      min_uptime: "5s",
    },
  ],
};
