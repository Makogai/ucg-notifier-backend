/**
 * Rewrites mysqldump table identifiers from lowercase to Prisma's PascalCase.
 * Run: node scripts/fix-seed-table-names.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const file = path.join(root, "seed-data.sql");

let s = fs.readFileSync(file, "utf8");

/** Order: longer names first to avoid partial matches (none overlap here). */
const pairs = [
  ["`subscription`", "`Subscription`"],
  ["`university`", "`University`"],
  ["`program`", "`Program`"],
  ["`subject`", "`Subject`"],
  ["`faculty`", "`Faculty`"],
  ["`post`", "`Post`"],
  ["`user`", "`User`"],
];

for (const [from, to] of pairs) {
  const before = s;
  s = s.split(from).join(to);
  if (before === s) {
    console.warn(`No occurrences of ${from}`);
  }
}

fs.writeFileSync(file, s);
console.log("Updated", file);
