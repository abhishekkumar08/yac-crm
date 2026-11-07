import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";

const SCHEMA = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
const depth = new WeakMap();

export function openDb(file = ":memory:") {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

const COLUMNS = [["users", "default_currency", "TEXT"]];

function migrate(db) {
  for (const [table, column, type] of COLUMNS) {
    const have = db.prepare(`SELECT 1 FROM pragma_table_info('${table}') WHERE name = ?`).get(column);
    if (!have) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

export function tx(db, fn) {
  const level = depth.get(db) ?? 0;
  const name = `sp${level}`;
  db.exec(`SAVEPOINT ${name}`);
  depth.set(db, level + 1);
  try {
    const result = fn();
    db.exec(`RELEASE ${name}`);
    return result;
  } catch (err) {
    db.exec(`ROLLBACK TO ${name}`);
    db.exec(`RELEASE ${name}`);
    throw err;
  } finally {
    depth.set(db, level);
  }
}

export const now = () => new Date().toISOString();
export const newId = (prefix = "") => prefix + randomBytes(8).toString("hex").slice(0, 15 - prefix.length);
