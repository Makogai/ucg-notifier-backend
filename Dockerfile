# --- build ---
FROM node:20-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
RUN npm ci

COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json ./
COPY src ./src

RUN npx prisma generate
RUN npm run build

# --- runtime ---
FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
# Puppeteer: bundled Chromium needs these libs (see Puppeteer troubleshooting).
# We'll prefer system chromium in container, so skip Puppeteer's download.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
  && rm -rf /var/lib/apt/lists/*

# Cache for Puppeteer-downloaded browser (writable by non-root).
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Compiled app + Prisma client output from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

COPY prisma ./prisma
COPY prisma.config.ts ./
COPY seed-data.sql ./
COPY seed-faculty-staff.sql ./
COPY ecosystem.config.cjs ./
COPY scripts ./scripts

RUN chmod +x /app/scripts/start-all-prod.sh \
  && mkdir -p /app/.cache/puppeteer \
  && chown -R node:node /app

USER node

EXPOSE 3000

# Default: API + worker + scheduler (PM2). Override CMD in Coolify if you split into 3 services:
#   node dist/index.js | node dist/workers/scraperWorker.js | node dist/jobs/schedulerPostsOnly.js
# Alternative single-container: /app/scripts/start-all-prod.sh
CMD ["./node_modules/.bin/pm2-runtime", "start", "ecosystem.config.cjs"]
