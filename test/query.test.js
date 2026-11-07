import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDb } from "./helpers.js";
import { buildQuery, resolveDateLiteral, QueryError } from "../server/query.js";
import { now } from "../server/db.js";
import { updateObject } from "../server/metadata.js";

function insert(db, object, id, ownerId, data, name = data.name) {
  db.prepare(`INSERT INTO records (id, object, name, owner_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, object, name, ownerId, JSON.stringify(data), now(), now());
}

function setup() {
  const env = freshDb();
  const { db, rep, peer } = env;
  insert(db, "opportunity", "006a", rep.id, { name: "Acme deal", amount: 5000, stage: "Prospecting", close_date: "2026-05-20", is_closed: false });
  insert(db, "opportunity", "006b", peer.id, { name: "Globex 100% renewal", amount: 120000, stage: "Closed Won", close_date: "2026-02-01", is_closed: true });
  insert(db, "opportunity", "006c", rep.id, { name: "Initech", amount: null, stage: "Qualification", close_date: "2026-07-03", is_closed: false });
  return env;
}

const ids = (env, opts, who = "admin") => {
  const q = buildQuery(env.db, env[who], { object: "opportunity", ...opts });
  return env.db.prepare(q.sql).all(...q.params).map((r) => r.id);
};

test("eq is case-insensitive on text", () => assert.deepEqual(ids(setup(), { filters: [{ field: "stage", op: "eq", value: "closed won" }] }), ["006b"]));
test("ne includes blanks", () => {
  const env = setup();
  assert.deepEqual(new Set(ids(env, { filters: [{ field: "amount", op: "ne", value: 5000 }] })), new Set(["006b", "006c"]));
});
test("contains escapes LIKE wildcards", () => assert.deepEqual(ids(setup(), { filters: [{ field: "name", op: "contains", value: "100%" }] }), ["006b"]));
test("starts", () => assert.deepEqual(ids(setup(), { filters: [{ field: "name", op: "starts", value: "ac" }] }), ["006a"]));
test("numeric gt compares numbers, not strings", () => assert.deepEqual(ids(setup(), { filters: [{ field: "amount", op: "gt", value: "9000" }] }), ["006b"]));
test("checkbox eq", () => assert.deepEqual(ids(setup(), { filters: [{ field: "is_closed", op: "eq", value: true }] }), ["006b"]));
test("blank and notblank", () => {
  const env = setup();
  assert.deepEqual(ids(env, { filters: [{ field: "amount", op: "blank" }] }), ["006c"]);
  assert.equal(ids(env, { filters: [{ field: "amount", op: "notblank" }] }).length, 2);
});
test("in takes a list", () => assert.deepEqual(new Set(ids(setup(), { filters: [{ field: "stage", op: "in", value: ["Prospecting", "Qualification"] }] })), new Set(["006a", "006c"])));
test("date literal ranges", () => {
  const env = setup();
  const today = new Date("2026-05-10T12:00:00");
  assert.deepEqual(ids(env, { filters: [{ field: "close_date", op: "eq", value: "THIS_QUARTER" }], today }), ["006a"]);
  assert.deepEqual(ids(env, { filters: [{ field: "close_date", op: "lt", value: "THIS_MONTH" }], today }), ["006b"]);
  assert.deepEqual(ids(env, { filters: [{ field: "close_date", op: "gt", value: "2026-06-30" }], today }), ["006c"]);
});
test("resolveDateLiteral", () => {
  const d = new Date("2026-05-10T12:00:00");
  assert.deepEqual(resolveDateLiteral("THIS_QUARTER", d), { from: "2026-04-01", to: "2026-06-30" });
  assert.deepEqual(resolveDateLiteral("LAST_MONTH", d), { from: "2026-04-01", to: "2026-04-30" });
  assert.deepEqual(resolveDateLiteral("THIS_WEEK", d), { from: "2026-05-04", to: "2026-05-10" });
  assert.deepEqual(resolveDateLiteral("LAST_N_DAYS:7", d), { from: "2026-05-03", to: "2026-05-10" });
  assert.deepEqual(resolveDateLiteral("NEXT_YEAR", d), { from: "2027-01-01", to: "2027-12-31" });
  assert.deepEqual(resolveDateLiteral("2026-01-02", d), { from: "2026-01-02", to: "2026-01-02" });
  assert.equal(resolveDateLiteral("SOMEDAY", d), null);
});
test("scope mine filters by owner", () => assert.deepEqual(new Set(ids(setup(), { scope: "mine" }, "rep")), new Set(["006a", "006c"])));
test("owner is a filterable system field", () => {
  const env = setup();
  assert.deepEqual(ids(env, { filters: [{ field: "owner", op: "eq", value: env.peer.id }] }), ["006b"]);
});
test("search matches name", () => assert.deepEqual(ids(setup(), { search: "glob" }), ["006b"]));
test("sort numeric with nulls last", () => assert.deepEqual(ids(setup(), { sort: { field: "amount", dir: "desc" } }), ["006b", "006a", "006c"]));
test("limit, offset and count", () => {
  const env = setup();
  const q = buildQuery(env.db, env.admin, { object: "opportunity", sort: { field: "name", dir: "asc" }, limit: 1, offset: 1 });
  assert.deepEqual(env.db.prepare(q.sql).all(...q.params).map((r) => r.id), ["006b"]);
  assert.equal(env.db.prepare(q.countSql).get(...q.countParams).n, 3);
});
test("deleted records excluded unless asked", () => {
  const env = setup();
  env.db.prepare("UPDATE records SET deleted_at = ? WHERE id = '006a'").run(now());
  assert.ok(!ids(env, {}).includes("006a"));
  assert.ok(ids(env, { includeDeleted: true }).includes("006a"));
});
test("private sharing applies", () => {
  const env = setup();
  updateObject(env.db, "opportunity", { sharing: "private" });
  assert.deepEqual(ids(env, {}, "peer"), ["006b"]);
});
test("unknown field throws", () => assert.throws(() => ids(setup(), { filters: [{ field: "ghost", op: "eq", value: 1 }] }), QueryError));
test("unknown op throws", () => assert.throws(() => ids(setup(), { filters: [{ field: "amount", op: "like", value: 1 }] }), QueryError));
test("field-name injection is rejected", () => {
  assert.throws(() => ids(setup(), { filters: [{ field: "x') OR 1=1 --", op: "eq", value: 1 }] }), QueryError);
  assert.throws(() => ids(setup(), { sort: { field: "amount; DROP TABLE records", dir: "asc" } }), QueryError);
  assert.throws(() => ids(setup(), { sort: { field: "amount", dir: "asc; DROP" } }), QueryError);
});

test("limit null returns every row, past the page cap", () => {
  const env = freshDb();
  const insertMany = env.db.prepare(`INSERT INTO records (id, object, name, owner_id, data, created_at, updated_at) VALUES (?, 'opportunity', ?, ?, '{}', ?, ?)`);
  for (let i = 0; i < 2005; i++) insertMany.run(`006bulk${String(i).padStart(8, "0")}`, `O${i}`, env.admin.id, now(), now());
  const q = buildQuery(env.db, env.admin, { object: "opportunity", limit: null });
  assert.equal(env.db.prepare(q.sql).all(...q.params).length, 2005);
  const paged = buildQuery(env.db, env.admin, { object: "opportunity", limit: 5000 });
  assert.equal(env.db.prepare(paged.sql).all(...paged.params).length, 2000);
});
