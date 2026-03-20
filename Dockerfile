# --- build ---
FROM node:20-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
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
RUN apt-get update \
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

RUN mkdir -p /app/.cache/puppeteer \
  && chown -R node:node /app

USER node

EXPOSE 3000

# Override per service in Coolify:
# - API (default):     node dist/index.js
# - Worker:            node dist/workers/scraperWorker.js
# - Scheduler:         node dist/jobs/schedulerPostsOnly.js
CMD ["node", "dist/index.js"]
