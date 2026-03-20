# Deploy on Coolify

This app needs **three long-running processes** plus **MySQL** and **Redis**:

| Process | Role | Typical production command (after `npm run build`) |
|--------|------|-----------------------------------------------------|
| **API** | HTTP REST (`express`) | `npm start` → `node dist/index.js` |
| **Worker** | BullMQ consumer (scrapes + notifications) | `npm run start:worker` → `node dist/workers/scraperWorker.js` |
| **Scheduler** | Enqueues recurring `scrapePosts` jobs | `npm run start:schedule:posts-only` → `node dist/jobs/schedulerPostsOnly.js` |

The worker **does not** enqueue the schedule by itself — the scheduler process registers the repeat job in Redis. Run **both** worker and scheduler in production.

---

## Docker (recommended)

The repo includes a **`Dockerfile`** (multi-stage: build + slim runtime with Puppeteer system libs).

```bash
docker build -t ucg-notifier .
```

- **Default command** (API): `node dist/index.js` — listens on **`PORT`** (default `3000`).
- **Worker** — set container command to: `node dist/workers/scraperWorker.js`
- **Scheduler** — set container command to: `node dist/jobs/schedulerPostsOnly.js`

In Coolify: choose **Dockerfile** build, same image for all three services, **only change the command** per service. Set env vars on each.

**First-time DB** (one-off job or Coolify “execute command”):

```bash
npx prisma migrate deploy
npx prisma db seed   # omit if SEED_SKIP=true or DB already filled
```

`seed-data.sql` is copied into the image at build time; keep it in the repo (or adjust `SEED_SQL_FILE` + bake a different file).

---

## 1. Create resources in Coolify

1. **MySQL** — create a database + user; note host, port, DB name, user, password.
2. **Redis** — create instance; note URL (e.g. `redis://:password@host:6379`).
3. **Three applications** (or three processes, depending on your Coolify version):
   - Same Git repo and **same env vars** for all three (at minimum `DATABASE_URL`, `REDIS_URL`, scraper + Firebase + `ADMIN_API_KEY`).
   - **Different start commands** (see table above).

### Build command (all three)

```bash
npm ci && npx prisma generate && npm run build
```

### Install / Prisma note

Use `npm ci` in CI/deploy so lockfile is respected. `prisma generate` must run before `node dist/...`.

---

## 2. Environment variables

Copy from `.env.example` and set in Coolify for **each** service:

- `DATABASE_URL` — `mysql://USER:PASSWORD@HOST:3306/DATABASE`
- `REDIS_URL`
- `SCRAPER_*` as needed
- `ADMIN_API_KEY`
- Firebase: **`FIREBASE_SERVICE_ACCOUNT_JSON`** (secret, full JSON string) **or** mount file + **`FIREBASE_SERVICE_ACCOUNT_PATH`**

Do **not** commit `serviceaccount.json`; use secrets in Coolify.

---

## 3. First deploy: migrations + seed SQL

On a **new** database:

1. Run migrations (once), e.g. Coolify “post-deploy” command or one-off container:

   ```bash
   npx prisma migrate deploy
   ```

2. Load committed seed file (see `seed-data.sql`):

   ```bash
   npx prisma db seed
   ```

   This runs `prisma/seed.ts`, which executes the SQL file (default `seed-data.sql` in repo root).

3. Set **`SEED_SKIP=true`** on later deploys if you want to avoid re-running seed (re-running can duplicate rows / fail on unique keys).

---

## 4. Process checklist

- [ ] API listening (port from `PORT`, often Coolify sets `3000` or proxy).
- [ ] Worker running (`start:worker`).
- [ ] Posts-only scheduler running (`start:schedule:posts-only`).
- [ ] Redis reachable from all three.
- [ ] MySQL reachable from all three.
- [ ] Same `REDIS_URL` and `DATABASE_URL` everywhere.

---

## 5. One Docker image, three commands

Same as the Docker section above: **one built image**, three Coolify services with different **command** (or override `CMD`). The Dockerfile already runs `npm run build` in the build stage.
