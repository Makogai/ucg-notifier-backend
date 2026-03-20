# Deploy on Coolify

This app needs **three long-running processes** (API + worker + scheduler) plus **MySQL** and **Redis**.

You can use **three Coolify services** (clearest ops) **or** **one service** with a **shell script** or **PM2** — see [§7](#7-one-container-vs-three-services).

---

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

- **Default Docker `CMD`** (no override): **PM2** runs API + worker + scheduler (`ecosystem.config.cjs`). Listens on **`PORT`** (default `3000`) for the API.
- **Split into 3 Coolify services** — override command per service:
  - `node dist/index.js`
  - `node dist/workers/scraperWorker.js`
  - `node dist/jobs/schedulerPostsOnly.js`

In Coolify: **Dockerfile** build. **One deployment** = full stack by default. Use command overrides only if you want three separate apps.

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
- [ ] **Worker + scheduler** use the **same** `REDIS_URL` as the API (one Redis for BullMQ).
- [ ] **Worker** has **Firebase** env vars too (`FIREBASE_SERVICE_ACCOUNT_JSON` or `PATH`) — FCM runs in the worker when it processes `notifySubscribers` jobs.

---

## 5. How to know worker & scheduler are running

### Coolify setup

**Default image `CMD`** runs **API + worker + scheduler** via PM2 — one deployment is enough.

If you **override** the start command to **API only** (`node dist/index.js`), queued notifications and scrapes **will not run** until you add a worker (and scheduler) somewhere.

**Split stack (optional):** same image, three Coolify services — override command per service:

| Role | Start command |
|------|----------------|
| API | `node dist/index.js` |
| Worker | `node dist/workers/scraperWorker.js` |
| Scheduler | `node dist/jobs/schedulerPostsOnly.js` |

If the **worker** is not running, **admin notify** jobs stay in Redis: the API **enqueues** `notifySubscribers`; the worker **consumes** it.

### What to check in logs

- **Worker** — on startup you should see something like: `Scraper worker started queue=ucg-scraper ...`. After you trigger an admin notify test, you should see: `Worker processing notifySubscribers` and logs from `NotificationService`.
- **Scheduler** — `Posts-only scheduler started queue=ucg-scraper every=...m` (then it mostly idles; it only enqueues periodic `scrapePosts`).
- **API** — `API listening on port ...` only proves HTTP is up, not that jobs run.

### If notifications still fail

1. Confirm the **worker** service exists, is **running**, and is on the **same Redis** as the API.
2. Confirm **Firebase** credentials on the **worker** (not only on the API).
3. Open **worker** logs right after clicking admin test — errors will appear there (FCM, DB, etc.).

---

## 6. One Docker image, three commands

Same as the Docker section above: **one built image**, three Coolify services with different **command** (or override `CMD`). The Dockerfile already runs `npm run build` in the build stage.

---

## 7. One container vs three services

| | **One Coolify app** | **Three Coolify apps** |
|---|---------------------|-------------------------|
| **Pros** | Simpler billing/UI; one place to set env | Independent restarts; clearer logs per role; scale API without worker |
| **Cons** | All processes share one deploy | Three deployments to watch |

### Option A — shell (minimal)

**Start command:**

```text
/app/scripts/start-all-prod.sh
```

### Option B — PM2 (recommended for one container)

**Pros:** auto-restart on crash, log lines prefixed by app name (`ucg-api`, `ucg-worker`, `ucg-scheduler-posts`), no extra OS packages.

**Start command:**

```text
npx pm2-runtime start ecosystem.config.cjs
```

Config: `ecosystem.config.cjs` in the repo root.

Locally after `npm run build`: `npm run start:pm2` (or `npm run start:all` for the shell version).

---

You should see **three** startups in logs: `API listening…`, `Scraper worker started…`, `Posts-only scheduler started…`.
