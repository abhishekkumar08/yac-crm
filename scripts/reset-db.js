import { existsSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { openDb } from "../server/db.js";
import { seedDemo } from "../server/seed.js";

const file = process.env.CRM_DB ?? fileURLToPath(new URL("../data/crm.db", import.meta.url));
if (existsSync(file)) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  for (const suffix of ["", "-wal", "-shm"]) {
    if (existsSync(file + suffix)) renameSync(file + suffix, `${file}.bak-${stamp}${suffix}`);
  }
  process.stdout.write(`Kept the old database as ${file}.bak-${stamp}\n`);
}
seedDemo(openDb(file));
process.stdout.write(`Fresh demo database at ${file}\n`);
