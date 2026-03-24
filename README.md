# UCG Notifier Backend

Node.js/TypeScript backend that scrapes `https://ucg.ac.me/`, normalizes data into MySQL (via Prisma), and exposes a REST API for a university mobile app.

## Features

- Scrape: faculties → programs → subjects → announcement posts
- Normalize + persist in MySQL (Prisma ORM)
- Deduplicate posts via `hash` (`sha256(title + url)`)
- REST API for browsing and subscriptions
- BullMQ background pipeline scheduled every 10 minutes
- New-post detection triggers a BullMQ job that sends Firebase Cloud Messaging (FCM) pushes (when configured)

## Tech Stack

- Node.js + TypeScript
- Express.js
- MySQL + Prisma
- Puppeteer (fetch dynamic HTML)
- Cheerio (HTML parsing)
- BullMQ + Redis (background jobs)
- dotenv + zod (DTO validation)

## Prerequisites

- MySQL running and accessible
- Redis running and accessible
- Node.js 18+

## Setup

1. Install dependencies
   ```bash
   npm install
   ```

2. Configure environment
   - Copy `.env.example` to `.env`
   - Set `DATABASE_URL` and `REDIS_URL`

3. Prisma: generate + migrate
   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   ```

   Prisma 7+ uses `prisma.config.ts` for the datasource URL (so `DATABASE_URL` must be present).

4. Seed basic data (creates `University` if missing)
   ```bash
   npx prisma db seed
   ```

5. Start scraping once (to populate faculties/programs/subjects/posts)
   ```bash
   npm run scrape:run-once
   ```

## Recurring Scraping (every 10 minutes)

Run:

1. BullMQ worker (processes jobs):
   ```bash
   npm run worker
   ```

2. Scheduler (enqueues the repeating pipeline):
   ```bash
   npm run schedule
   ```

Pipeline order (job names):

1. `scrapeFaculties` (repeat every N minutes)
2. `scrapePrograms`
3. `scrapeSubjects`
4. `scrapePosts`
5. For each newly created post: `notifySubscribers` (looks up subscriptions and logs notification targets)

## How Scraping Works

Scraper logic lives in `src/services/ScraperService.ts` and parsing heuristics in `src/scraper/ucgScraper.ts`.

- Step 1: Faculties
  - Fetches homepage
  - Finds the `Članice` (`facultyMenuLabels`) mega-menu
  - Extracts faculty links and derives `shortCode` from the URL path

- Step 2: Programs
  - Fetches each `Faculty.url`
  - Extracts all program links matching `/studprog/`
  - Infers program `type` from the `/studprog/...` URL segments

- Step 3: Subjects
  - Fetches each `Program.url`
  - Locates the `Predmeti` heading and parses the first table under it
  - Extracts from the table columns:
    - `Sem` -> `Subject.semester`
    - `Naziv` -> `Subject.name` (and `code` from the subject link)
    - `ECTS` -> `Subject.ects`

- Step 4: Posts
  - Fetches each `Program.url`
  - Finds the "posts list" link (href containing `/objave_spisak/poslao/studprog/`)
  - Parses table rows for: `title`, `subject name (heuristic)`, `url`, and `publishedAt (heuristic)`
  - Computes `hash = sha256(title + url)` and inserts only when unseen

Selectors are centralized in `src/config/scraper.ts` so changes in the website can be handled without rewriting scraper code.

## REST API

Base path: server root (`/`).

Full endpoint docs for Flutter are in `API_DOCUMENTATION.md`.

### Faculties

- `GET /faculties`
- `GET /faculties/:id/programs`

Example:
```bash
curl http://localhost:3000/faculties
```

### Programs / Subjects / Posts

- `GET /programs/:id/subjects`
- `GET /programs/:id/posts?semester=<NUMBER>` (optional)
- `GET /subjects/:id/posts`

Example:
```bash
curl http://localhost:3000/programs/<PROGRAM_ID>/posts
```

### Subscriptions

There is no backend user registration. Instead, the client identifies a user by:
- `deviceId`: stable identifier stored on-device
- `fcmToken`: Firebase Cloud Messaging token for push notifications

### Device registration (FCM token)

- `POST /device`
  - Body:
    ```json
    { "deviceId": "abc123", "fcmToken": "<FCM_TOKEN>" }
    ```

### Subscribe

- `POST /subscriptions`
  - Body:
    ```json
    {
      "deviceId": "abc123",
      "fcmToken": "<FCM_TOKEN>",
      "type": "PROGRAM",
      "referenceId": 123,
      "semester": 3
    }
    ```
  - Semantics:
    - `PROGRAM` with `semester` omitted => whole program
    - `PROGRAM` with `semester` provided => per-semester subscription (matches `Post.subject.semester`)
    - `SUBJECT` ignores `semester` (subject already belongs to a semester)
    - `FACULTY` ignores `semester`

- `GET /subscriptions?deviceId=<DEVICE_ID>`

Example:
```bash
curl -X POST http://localhost:3000/subscriptions \
  -H "content-type: application/json" \
  -d '{
    "deviceId":"abc123",
    "fcmToken":"<FCM_TOKEN>",
    "type":"SUBJECT",
    "referenceId":456
  }'
```

Example response (`GET /subscriptions`):
```json
{
  "items": [
    {
      "id": 1,
      "type": "PROGRAM",
      "referenceId": 123,
      "semester": 0,
      "scope": { "id": 123, "name": "...", "type": "MASTER", "facultyId": 1 }
    }
  ]
}
```

## Firebase (FCM) Push Notifications

Configure one of:
- `FIREBASE_SERVICE_ACCOUNT_JSON` (stringified service account JSON), or
- `FIREBASE_SERVICE_ACCOUNT_PATH` (path to the service account JSON file)

When a new post is inserted, the backend finds matching subscriptions and sends an FCM push to each device token.

FCM message `data` fields:
- `postId` (string)
- `url` (string)
- `title` (string)
- `programId` (string, may be empty)
- `subjectId` (string, may be empty)
- `subjectSemester` (string, may be empty)

## Database Schema (Prisma)

Models:

- `University`
  - Optional root entity (seeded)
- `Faculty`
  - `shortCode` is unique
  - Has many `Program`s
- `Program`
  - `type`: `OSNOVNE | MASTER | DOKTORSKE | SPECIJALISTICKE | MAGISTARSKE`
  - `url` is unique (used by the scraper)
  - Has many `Subject`s and `Post`s
- `Subject`
  - Unique per `(programId, code)` (derived from the subject link)
  - Stores `semester` (from `Sem`) and `ects` (from `ECTS`)
  - Has many `Post`s
- `Post`
  - Represents announcement posts
  - Dedup key: unique `hash`
  - Can be linked to a `subject` and/or a `program` (both nullable)
- `User`
  - Unique by `deviceId` (no registration)
  - Stores the latest `fcmToken` for push notifications
- `Subscription`
  - Polymorphic subscription via `(type, referenceId)`:
    - `FACULTY` -> Faculty.id
    - `PROGRAM` -> Program.id (optional semester filter)
    - `SUBJECT` -> Subject.id
  - Unique by `(userId, type, referenceId, semester)`

## Notes / Extending

- Scraper robustness: parsing uses heuristics; if UCG changes markup, update selectors/heuristics in `src/config/scraper.ts` and `src/scraper/ucgScraper.ts`.
- Notifications: `notifySubscribers` sends FCM pushes via Firebase Admin (when configured).


Local testing:
if database changes made: npx prisma migrate reset --force
then we can npx prisma db seed (to seed seed-data.sql)
