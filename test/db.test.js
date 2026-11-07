import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb, tx } from "../server/db.js";

const TABLES = ["users", "roles", "sessions", "objects", "fields", "layouts", "list_views", "records",
  "field_history", "validation_rules", "automations", "reports", "dashboards"];

test("openDb creates every table", () => {
  const db = openDb(":memory:");
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
  for (const t of TABLES) assert.ok(names.includes(t), `missing ${t}`);
});

test("tx commits on success", () => {
  const db = openDb(":memory:");
  tx(db, () => db.prepare("INSERT INTO roles (id, name) VALUES ('r1', 'A')").run());
  assert.equal(db.prepare("SELECT count(*) AS n FROM roles").get().n, 1);
});

test("nested tx rolls back everything when the inner one throws", () => {
  const db = openDb(":memory:");
  assert.throws(() => tx(db, () => {
    db.prepare("INSERT INTO roles (id, name) VALUES ('r1', 'A')").run();
    tx(db, () => {
      db.prepare("INSERT INTO roles (id, name) VALUES ('r2', 'B')").run();
      throw new Error("boom");
    });
  }), /boom/);
  assert.equal(db.prepare("SELECT count(*) AS n FROM roles").get().n, 0);
});

test("inner tx failure caught by outer keeps outer work", () => {
  const db = openDb(":memory:");
  tx(db, () => {
    db.prepare("INSERT INTO roles (id, name) VALUES ('r1', 'A')").run();
    try { tx(db, () => { db.prepare("INSERT INTO roles (id, name) VALUES ('r2', 'B')").run(); throw new Error("x"); }); } catch { /* expected */ }
  });
  assert.deepEqual(db.prepare("SELECT id FROM roles").all().map((r) => r.id), ["r1"]);
});
