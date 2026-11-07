import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../server/db.js";
import { createApp } from "../server/app.js";
import { seedDemo, DEMO_PASSWORD } from "../server/seed.js";
import { hashPassword, verifyPassword } from "../server/auth.js";

let server, base;
before(async () => {
  const db = openDb(":memory:");
  seedDemo(db, { records: false });
  server = createApp(db).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());

async function login(email = "admin@yac.local", password = DEMO_PASSWORD) {
  const res = await fetch(`${base}/auth/login`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }) });
  return { res, cookie: res.headers.get("set-cookie")?.split(";")[0] };
}
const call = (cookie, path, { method = "GET", body } = {}) => fetch(`${base}${path}`, {
  method, headers: { cookie, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
  body: body !== undefined ? JSON.stringify(body) : undefined,
});

test("passwords hash with a salt and verify", () => {
  const h = hashPassword("s3cret!");
  assert.notEqual(h, hashPassword("s3cret!"));
  assert.equal(verifyPassword("s3cret!", h), true);
  assert.equal(verifyPassword("wrong", h), false);
});

test("login sets an httpOnly cookie and /me works; bad password is 401", async () => {
  const { res, cookie } = await login();
  assert.equal(res.status, 200);
  assert.match(res.headers.get("set-cookie"), /HttpOnly/i);
  assert.match(res.headers.get("set-cookie"), /SameSite=Lax/i);
  const me = await (await call(cookie, "/me")).json();
  assert.equal(me.email, "admin@yac.local");
  assert.equal(me.profile, "admin");
  assert.equal((await login("admin@yac.local", "nope")).res.status, 401);
});

test("unauthenticated requests get 401", async () => {
  assert.equal((await fetch(`${base}/records/account`)).status, 401);
});

test("mutations must be JSON", async () => {
  const { cookie } = await login();
  const res = await fetch(`${base}/records/account`, { method: "POST", headers: { cookie, "content-type": "application/x-www-form-urlencoded" }, body: "name=x" });
  assert.equal(res.status, 415);
});

test("create, read, list, update and delete a record over HTTP", async () => {
  const { cookie } = await login();
  const created = await call(cookie, "/records/account", { method: "POST", body: { name: "Http Co", industry: "Retail" } });
  assert.equal(created.status, 201);
  const acc = await created.json();
  assert.equal((await (await call(cookie, `/records/account/${acc.id}`)).json()).name, "Http Co");
  const list = await (await call(cookie, `/records/account?q=http`)).json();
  assert.equal(list.total, 1);
  const patched = await (await call(cookie, `/records/account/${acc.id}`, { method: "PATCH", body: { rating: "Hot" } })).json();
  assert.equal(patched.rating, "Hot");
  assert.equal((await call(cookie, `/records/account/${acc.id}`, { method: "DELETE", body: {} })).status, 204);
  assert.equal((await call(cookie, `/records/account/${acc.id}`)).status, 404);
  const bin = await (await call(cookie, "/recycle-bin")).json();
  assert.ok(bin.some((r) => r.id === acc.id));
});

test("validation errors come back as 400 with fields", async () => {
  const { cookie } = await login();
  const res = await call(cookie, "/records/opportunity", { method: "POST", body: { name: "" } });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.fields.name, "Complete this field.");
});

test("list view parameters: view id, filters and sort", async () => {
  const { cookie } = await login();
  for (const n of ["B lead", "A lead"]) await call(cookie, "/records/lead", { method: "POST", body: { last_name: n, company: "C" } });
  const meta = await (await call(cookie, "/meta/objects/lead")).json();
  const view = meta.views.find((v) => v.name === "All Open Leads");
  const res = await (await call(cookie, `/records/lead?view=${view.id}&sort=last_name:asc&filters=${encodeURIComponent(JSON.stringify([{ field: "company", op: "eq", value: "C" }]))}`)).json();
  assert.deepEqual(res.records.map((r) => r.last_name), ["A lead", "B lead"]);
});

test("setup routes are admin-only", async () => {
  const { cookie } = await login("rep1@yac.local");
  const res = await call(cookie, "/meta/objects", { method: "POST", body: { label: "Thing", plural: "Things" } });
  assert.equal(res.status, 403);
  const { cookie: adminCookie } = await login();
  assert.equal((await call(adminCookie, "/meta/objects", { method: "POST", body: { label: "Thing", plural: "Things" } })).status, 201);
});

test("CSV export is text/csv", async () => {
  const { cookie } = await login();
  const res = await call(cookie, "/export/account");
  assert.match(res.headers.get("content-type"), /text\/csv/);
  assert.match(res.headers.get("content-disposition"), /attachment/);
});

test("logout ends the session", async () => {
  const { cookie } = await login();
  await call(cookie, "/auth/logout", { method: "POST", body: {} });
  assert.equal((await call(cookie, "/me")).status, 401);
});
