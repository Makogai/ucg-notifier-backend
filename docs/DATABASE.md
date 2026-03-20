# Database: table name case (MySQL)

Prisma migrations create tables with **PascalCase** names matching the model names: `Faculty`, `Post`, `User`, etc.

### Why dumps sometimes use lowercase

On **Windows**, MySQL often uses `lower_case_table_names = 1`, so `mysqldump` may emit **`faculty`**, **`post`**, …

On **Linux** (typical server), `lower_case_table_names` is often **0**: table names are **case-sensitive**. Then `faculty` ≠ `Faculty`, and importing a lowercase dump fails or targets the wrong tables.

### What we do in this repo

- **`seed-data.sql`** uses backtick-quoted **PascalCase** table names so it matches `prisma/migrations`.
- If you regenerate a dump locally and get lowercase again, run:

  ```bash
  node scripts/fix-seed-table-names.mjs
  ```

### Alternative: dump from the server

After `prisma migrate deploy` on Linux, run `mysqldump` **on that server** (or with the same settings). The dump will usually match the real table names.

### Nuclear option (not required here)

Align MySQL’s `lower_case_table_names` everywhere and/or use explicit `@@map("...")` in `schema.prisma` — only needed if you intentionally want **snake_case** table names; that requires a migration to rename tables.
