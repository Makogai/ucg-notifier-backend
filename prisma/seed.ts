/**
 * Loads data from a mysqldump-style SQL file (repo root: `seed-data.sql` by default).
 * Run after `prisma migrate deploy` on an empty DB (or expect duplicate key errors if re-run).
 *
 * Env:
 * - DATABASE_URL (required) — same as Prisma
 * - SEED_SQL_FILES — comma-separated list of paths relative to project root (default: seed-data.sql)
 * - SEED_SQL_FILE — backwards-compatible single file (if SEED_SQL_FILES is not set)
 * - SEED_SKIP — if "1" or "true", exits without seeding
 */
import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

function parseMysqlConnection(databaseUrl: string) {
  const u = new URL(databaseUrl);
  if (u.protocol !== "mysql:") {
    throw new Error(
      `SEED: DATABASE_URL must use mysql:// protocol (got ${u.protocol})`,
    );
  }
  const database = u.pathname.replace(/^\//, "") || undefined;
  return {
    host: u.hostname,
    port: u.port ? parseInt(u.port, 10) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database,
    multipleStatements: true,
  } as const;
}

async function main() {
  const skip = process.env.SEED_SKIP?.toLowerCase();
  if (skip === "1" || skip === "true") {
    console.log("SEED: SEED_SKIP set — skipping SQL seed.");
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("SEED: DATABASE_URL is required");
  }

  const seedSqlFilesEnv = process.env.SEED_SQL_FILES?.trim();
  const seedSqlFileSingle = process.env.SEED_SQL_FILE?.trim();

  const seedFiles = seedSqlFilesEnv
    ? seedSqlFilesEnv
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [seedSqlFileSingle || "seed-data.sql"];

  const config = parseMysqlConnection(databaseUrl);
  console.log(
    `SEED: Applying ${seedFiles.join(", ")} → ${config.database} @ ${config.host}…`,
  );

  const conn = await mysql.createConnection(config);
  try {
    for (const relative of seedFiles) {
      const sqlPath = path.resolve(process.cwd(), relative);
      if (!existsSync(sqlPath)) {
        throw new Error(`SEED: SQL file not found: ${sqlPath}`);
      }

      const sql = readFileSync(sqlPath, "utf8");
      if (!sql.trim()) {
        throw new Error(`SEED: SQL file is empty: ${sqlPath}`);
      }

      // When we reset/migrate, Prisma will already recreate `_prisma_migrations`.
      // Your SQL dump may include `_prisma_migrations` blocks.
      // If we remove only matching lines, we can leave behind fragments
      // (e.g. column definitions) which makes the SQL invalid.
      // Instead, strip the whole `_prisma_migrations` block.
      const lines = sql.split(/\r?\n/);
      const filteredLines: string[] = [];
      let skipping = false;

      for (const line of lines) {
        if (!skipping && line.includes("_prisma_migrations")) {
          skipping = true;
          continue;
        }

        if (skipping) {
          // Typical mysqldump layout includes:
          //   LOCK TABLES `_prisma_migrations` WRITE;
          //   ...
          //   UNLOCK TABLES;
          if (line.includes("UNLOCK TABLES;")) {
            skipping = false;
          }
          continue;
        }

        filteredLines.push(line);
      }

      const filteredSql = filteredLines.join("\n");

      console.log(`SEED: Applying ${relative}… (filtered _prisma_migrations lines)`);
      await conn.query(filteredSql);
    }
  } finally {
    await conn.end();
  }

  console.log("SEED: Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
