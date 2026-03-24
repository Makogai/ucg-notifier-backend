/**
 * Rewrites mysqldump-style backticked table identifiers in `seed-data.sql`
 * to the plural lowercase names used by Prisma `@@map(...)`.
 *
 * Run:
 *   node scripts/transform-seed-table-names-to-lower-plural.mjs
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const file = path.join(root, "seed-data.sql");

if (!fs.existsSync(file)) {
  throw new Error(`seed-data.sql not found at ${file}`);
}

let s = fs.readFileSync(file, "utf8");

const pairs = [
  ["`University`", "`universities`"],
  ["`Faculty`", "`faculties`"],
  ["`Program`", "`programs`"],
  ["`Subject`", "`subjects`"],
  ["`Post`", "`posts`"],
  ["`User`", "`users`"],
  ["`Subscription`", "`subscriptions`"],
  // Just in case there are lowercase variants.
  ["`university`", "`universities`"],
  ["`faculty`", "`faculties`"],
  ["`program`", "`programs`"],
  ["`subject`", "`subjects`"],
  ["`post`", "`posts`"],
  ["`user`", "`users`"],
  ["`subscription`", "`subscriptions`"],
];

for (const [from, to] of pairs) {
  s = s.split(from).join(to);
}

fs.writeFileSync(file, s);
console.log("Updated:", file);

