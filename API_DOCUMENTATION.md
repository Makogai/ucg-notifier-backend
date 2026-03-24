# UCG Notifier API Documentation (Backend -> Flutter)

Base URL: `http://127.0.0.1:3000`

Swagger UI: `http://127.0.0.1:3000/swagger`

All primary keys are **integers** (`Int`).

## Program Type Values

`Program.type` can be one of:
- `OSNOVNE`
- `MASTER`
- `SPECIJALISTICKE`
- `MAGISTARSKE`
- `DOKTORSKE`

## Faculties / Programs / Subjects

### `GET /faculties`

Response:
```json
{
  "items": [
    { "id": 1, "name": "ETG", "shortCode": "etf", "url": "https://...", "logoUrl": "https://ucg.ac.me/flogo/etflogolat.png" }
  ]
}
```

### `GET /faculties/:id/programs`

Response:
```json
{
  "faculty": { "id": 1, "name": "..." },
  "items": [
    { "id": 10, "name": "ENERGETIKA...", "type": "OSNOVNE", "url": "https://..." }
  ]
}
```

### `GET /faculties/:id/staff?category=<OPTIONAL_STRING>`

Returns staff “cards” scraped from the faculty staff page (`/osoblje/<shortCode>`).
Same professor can appear multiple times if they are listed in multiple staff categories/sections.

Response:
```json
{
  "faculty": { "id": 1, "name": "...", "shortCode": "etf" },
  "items": [
    {
      "id": 123,
      "professorId": 55,
      "profileUrl": "https://ucg.ac.me/radnik/130329-budimir-lutovac",
      "name": "dr Budimir Lutovac",
      "email": "budo@ucg.ac.me",
      "position": "dekan",
      "category": "Rukovodstvo",
      "avatarUrl": "https://ucg.ac.me/tumber.php?src=..."
    }
  ]
}
```

Ordering: `category ASC`, then `position ASC`, then `name ASC`.

### `GET /faculties/:id/posts?section=<OPTIONAL>&limit=<N>&offset=<N>`

Returns posts scraped at **faculty level** (`Post.facultyId` matches the faculty). These are the sections like Obavještenja, Vijesti, Akademska obavještenja, Obavještenja za predmete, etc.

Query parameters:
- `section` (optional): **exact** match on `Post.section` as stored (e.g. `Obavještenja`, `Vijesti`). Omit to return all faculty posts for that faculty.
- `limit` (optional): default `200`, max `500`.
- `offset` (optional): default `0` for pagination.

Ordering: `publishedAt DESC`, then `id DESC`.

Response:
```json
{
  "faculty": { "id": 17, "name": "Prirodno-matematički fakultet", "shortCode": "pmf" },
  "items": [
    {
      "id": 1234,
      "title": "…",
      "content": "plain text…",
      "contentHtml": "<div>…</div>",
      "section": "Obavještenja",
      "url": "https://ucg.ac.me/objava/blog/…",
      "publishedAt": "2026-03-20T12:00:00.000Z",
      "hash": "…",
      "facultyId": 17,
      "subjectId": null,
      "programId": null,
      "createdAt": "…",
      "updatedAt": "…"
    }
  ]
}
```

### `GET /posts?facultyId=<ID>&section=<OPTIONAL>&limit=<N>&offset=<N>`

Same data as `GET /faculties/:id/posts`, but the faculty is selected with `facultyId` in the query string (useful for generic HTTP clients).

### `GET /professors/:id`
Returns full professor details by professor id (biography, teaching subjects, selected publications, academic contributions).
Response:
```json
{
  "professor": {
    "id": 55,
    "profileUrl": "https://ucg.ac.me/radnik/130329-budimir-lutovac",
    "name": "dr Budimir Lutovac",
    "email": "budo@ucg.ac.me",
    "avatarUrl": "https://ucg.ac.me/tumber.php?src=...",
    "biographyHtml": "<div>...</div>",
    "biographyText": "plain text biography..."
  },
  "teachings": [
    {
      "id": 1001,
      "subjectId": 964,
      "unit": "....",
      "programName": "....",
      "programType": "OSNOVNE",
      "semester": 1,
      "subjectName": "....",
      "pXgp": 10,
      "vXgv": 2,
      "lXgl": 6
    }
  ],
  "selectedPublications": [
    {
      "id": 2001,
      "year": 2022,
      "category": "Q1a-...",
      "authors": "....",
      "title": "....",
      "source": "....",
      "url": "https://..."
    }
  ],
  "academicContributions": [
    {
      "id": 3001,
      "contributionGroup": "M1a-...",
      "year": 2019,
      "ucgAuthors": "...",
      "details": "..."
    }
  ]
}
```

### `GET /professors/by-profile?profileUrl=<PROFILE_URL>`
Same as above, but finds the professor by `profileUrl`.

### Developer: how to populate professor details
Run (one-off) after seeding/scraping faculty staff so `Professor` rows exist:
```powershell
$env:SCRAPER_TEST_PROFILE_URL='https://ucg.ac.me/radnik/130329-budimir-lutovac'
npm run scrape:professor-details:once
```

To scrape multiple professors with missing `biographyHtml`:
```powershell
npm run scrape:professor-details:once
```

Optional env:
- `SCRAPER_PROFILE_DETAILS_LIMIT` (default `20`)

### `GET /programs/:id/subjects`

Response:
```json
{
  "program": { "id": 10, "name": "..." , "type": "OSNOVNE"},
  "items": [
    { "id": 100, "name": "OSNOVI ELEKTROTEHNIKE", "code": "946", "semester": 1, "ects": 6.0, "programId": 10 }
  ]
}
```

Subject ordering: `semester ASC`, then `name ASC`.

### `GET /programs/:id/posts?semester=<NUMBER>`

`semester` is optional:
- if omitted: returns latest posts for the program
- if provided: returns posts linked to subjects with `subject.semester = semester`

Response:
```json
{
  "program": { "id": 10, "name": "..." },
  "items": [
    { "id": 2000, "title": "Nova obavještenja...", "url": "https://...", "publishedAt": "2026-01-01T12:00:00.000Z", "hash": "..." , "subjectId": 100, "programId": 10 }
  ]
}
```

### `GET /subjects/:id/posts`

Response:
```json
{
  "subject": { "id": 100, "name": "OSNOVI ELEKTROTEHNIKE", "code": "946", "programId": 10 },
  "items": [
    { "id": 2000, "title": "...", "url": "https://...", "publishedAt": "..." }
  ]
}
```

## Device Registration (No Login)

There is no email/password login. A user is identified by `deviceId` generated and stored on-device.

### `POST /device`

Request body:
```json
{
  "deviceId": "abc123",
  "fcmToken": "<FCM_TOKEN>"
}
```

Response:
```json
{
  "item": { "id": 1, "deviceId": "abc123", "fcmToken": "<FCM_TOKEN>", "createdAt": "..." }
}
```

## Subscriptions (Faculty / Program / Subject)

### `POST /subscriptions`

Request body:
```json
{
  "deviceId": "abc123",
  "fcmToken": "<FCM_TOKEN>",
  "type": "PROGRAM",
  "referenceId": 10,
  "semester": 3
}
```

Semantics:
- `type = FACULTY`
  - `referenceId` = `Faculty.id`
  - `semester` is ignored
- `type = PROGRAM`
  - `referenceId` = `Program.id`
  - `semester` omitted means subscribe to **whole program** (backend stores `semester=0`)
  - `semester` provided means subscribe to **that semester** (backend stores `semester=N`)
- `type = SUBJECT`
  - `referenceId` = `Subject.id`
  - `semester` is ignored (subject already belongs to one semester)

Response:
```json
{ "item": { "id": 123, "type": "PROGRAM", "referenceId": 10, "semester": 3 } }
```

### `GET /subscriptions?deviceId=<DEVICE_ID>`

Response:
```json
{
  "items": [
    {
      "id": 123,
      "type": "PROGRAM",
      "referenceId": 10,
      "semester": 3,
      "program": {
        "id": 10,
        "name": "...",
        "type": "OSNOVNE",
        "facultyId": 1
      },
      "faculty": null,
      "subject": null
    }
  ]
}
```

For `type="SUBJECT"`, the item includes a `subject` object with:
- `id`, `name`, `code`, `semester`, `ects`, `programId`

For `type="PROGRAM"`, the item includes a `program` object with:
- `id`, `name`, `type`, `facultyId`

For `type="FACULTY"`, the item includes a `faculty` object with:
- `id`, `name`, `shortCode`

### Unsubscribe

- `POST /subscriptions/unsubscribe`

Request body:
```json
{
  "deviceId": "abc123",
  "type": "PROGRAM",
  "referenceId": 10,
  "semester": 3
}
```

Semantics:
- `type="PROGRAM"` uses `semester` (0/omitted = whole program)
- `type="FACULTY"` ignores `semester`
- `type="SUBJECT"` ignores `semester`

Response:
```json
{ "deleted": 1 }
```

### Delete by Subscription ID

- `DELETE /subscriptions/:id`

Response:
```json
{ "deleted": 1 }
```

## Firebase Cloud Messaging (FCM) Push Payload

When the scraper detects a new post (dedup by post `hash`), the backend sends FCM pushes to matching subscriptions.

FCM message `data` fields:
- `postId` (string)
- `url` (string)
- `title` (string)
- `programId` (string, may be empty)
- `subjectId` (string, may be empty)
- `subjectSemester` (string, may be empty)

Flutter should read `message.data` inside:
- `FirebaseMessaging.onMessage`
- `FirebaseMessaging.onMessageOpenedApp`

## Admin Endpoints (for testing notifications only)

Protected by `ADMIN_API_KEY`.

### `GET /admin?key=<ADMIN_API_KEY>`

Opens a simple HTML form.

### `POST /admin/test-notify?key=<ADMIN_API_KEY>`

Send a push to an explicit FCM token (token-based; device mapping is TODO until device saving is finalized).

Body:
```json
{
  "token": "<FCM_TOKEN>",
  "title": "Nova obavještenja",
  "body": "Test poruka",
  "data": { "postId": "0" }
}
```

### `POST /admin/test-new-post-notify?key=<ADMIN_API_KEY>`

End-to-end test for “new post → notifySubscribers → push”.

This endpoint creates/updates:
- a device `User` (deviceId -> fcmToken)
- a `Subscription` for that device (based on `subscription.type` + `semesterMode`)
- a `Post` linked to `subjectId`

Then it enqueues `notifySubscribers` so any matching subscriptions in the DB receive the FCM.

### `POST /admin/test-new-post-broadcast-notify?key=<ADMIN_API_KEY>`

Broadcast test: create a new `Post` for `subjectId` and enqueue `notifySubscribers` to notify **all existing matching subscriptions**.

Request body:
```json
{
  "subjectId": 100,
  "post": { "title": "Test obavještenje", "url": "https://example.com/test-broadcast-1" }
}
```

Request body:
```json
{
  "deviceId": "abc123",
  "fcmToken": "<FCM_TOKEN>",
  "subscription": {
    "type": "PROGRAM",
    "semesterMode": "FROM_SUBJECT"
  },
  "subjectId": 100,
  "post": {
    "title": "Test obavještenje",
    "url": "https://example.com/test-1"
  }
}
```

