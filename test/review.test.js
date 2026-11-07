import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { freshDb } from "./helpers.js";
import { updateObject } from "../server/metadata.js";
import { createRecord, updateRecord, getRecord, deleteRecord, ForbiddenError } from "../server/records.js";
import { saveProcess, submit, pendingFor } from "../server/approvals.js";
import { post, comment, recordFeed } from "../server/feed.js";
import { listNotifications } from "../server/notifications.js";
import { saveCurrencies, convert, listCurrencies } from "../server/currency.js";
import { convertLead } from "../server/convert.js";
import { addFile, readFile, setFilesDir, contentDisposition } from "../server/files.js";
import { sendEmail } from "../server/email.js";

const enableCurrencies = (db) => saveCurrencies(db, { multiCurrency: true, corporate: "USD", currencies: [
  { isoCode: "USD", name: "US Dollar", rate: 1, active: true }, { isoCode: "EUR", name: "Euro", rate: 0.5, active: true }] });

test("submitting for approval needs edit access", () => {
  const { ctx, db } = freshDb();
  updateObject(db, "account", { sharing: "public_ro" });
  saveProcess(db, { object: "account", name: "Any", criteria: "TRUE", approverType: "manager" });
  const acc = createRecord(ctx("support"), "account", { name: "Theirs" });
  assert.throws(() => submit(ctx("rep"), "account", acc.id), ForbiddenError);
});

test("mentions and comment notifications skip people who can't read the record", () => {
  const { ctx, db, rep, peer } = freshDb();
  updateObject(db, "opportunity", { sharing: "private" });
  const opp = createRecord(ctx("support"), "opportunity", { name: "Secret deal", close_date: "2026-01-01" });
  post(ctx("support"), "opportunity", opp.id, `pricing is 40% off @[${rep.name}](${rep.id})`);
  assert.equal(listNotifications(ctx("rep")).items.length, 0);
  const item = post(ctx("admin"), "opportunity", opp.id, "note");
  db.prepare("UPDATE users SET profile = 'standard', role_id = 'r_rep' WHERE id = 'u_admin'").run();
  comment(ctx("support"), item.id, "secret reply");
  assert.equal(listNotifications({ db, user: { id: "u_admin", profile: "standard", roleId: "r_rep" } }).items.length, 0);
  assert.equal(peer.id, "u_peer");
});

test("turning multi-currency off and editing keeps the record's currency", () => {
  const { ctx, db } = freshDb();
  enableCurrencies(db);
  const opp = createRecord(ctx(), "opportunity", { name: "Euro deal", close_date: "2026-01-01", amount: 1000, currency_iso_code: "EUR" });
  saveCurrencies(db, { multiCurrency: false, corporate: "USD", currencies: listCurrencies(db) });
  updateRecord(ctx(), "opportunity", opp.id, { name: "Euro deal 2" });
  enableCurrencies(db);
  assert.equal(getRecord(ctx(), "opportunity", opp.id).currency_iso_code, "EUR");
});

test("changing the corporate currency rebases the rates", () => {
  const { db } = freshDb();
  enableCurrencies(db);
  saveCurrencies(db, { multiCurrency: true, corporate: "EUR", currencies: listCurrencies(db) });
  assert.equal(convert(db, 100, "EUR", "USD"), 200);
  assert.equal(listCurrencies(db).find((c) => c.isoCode === "EUR").rate, 1);
  assert.equal(listCurrencies(db).find((c) => c.isoCode === "USD").rate, 2);
});

test("an opportunity with products can't change currency", () => {
  const { ctx, db } = freshDb();
  enableCurrencies(db);
  const p = createRecord(ctx(), "product", { name: "W" });
  const opp = createRecord(ctx(), "opportunity", { name: "O", close_date: "2026-01-01", currency_iso_code: "USD" });
  createRecord(ctx(), "opportunity_line_item", { opportunity: opp.id, product: p.id, quantity: 1, unit_price: 10 });
  assert.throws(() => updateRecord(ctx(), "opportunity", opp.id, { currency_iso_code: "EUR" }), /products/);
});

test("deleting a record clears its pending approval", () => {
  const { ctx, db } = freshDb();
  saveProcess(db, { object: "opportunity", name: "All", criteria: "TRUE", approverType: "manager", lockRecord: false });
  const opp = createRecord(ctx("rep"), "opportunity", { name: "O", close_date: "2026-01-01" });
  submit(ctx("rep"), "opportunity", opp.id);
  deleteRecord(ctx("rep"), "opportunity", opp.id);
  assert.equal(pendingFor(ctx("manager")).length, 0);
});

test("a lead waiting for approval can't be converted by someone else", () => {
  const { ctx, db } = freshDb();
  saveProcess(db, { object: "lead", name: "All", criteria: "TRUE", approverType: "manager" });
  const lead = createRecord(ctx("rep"), "lead", { last_name: "L", company: "C" });
  submit(ctx("rep"), "lead", lead.id);
  assert.throws(() => convertLead(ctx("peer"), lead.id, {}), ForbiddenError);
});

test("file names keep whole characters and odd types fall back safely", () => {
  const dir = mkdtempSync(join(tmpdir(), "crm-files-"));
  setFilesDir(dir);
  const { ctx } = freshDb();
  const acc = createRecord(ctx(), "account", { name: "A" });
  const f = addFile(ctx(), "account", acc.id, { name: `${"a".repeat(199)}😀.pdf`, type: "text/plain\r\nX: y", data: Buffer.from("x").toString("base64") });
  assert.doesNotThrow(() => contentDisposition(f.name));
  assert.equal(f.type, "application/octet-stream");
  rmSync(dir, { recursive: true });
});

test("a relative files directory still gives absolute paths, and a missing file is not found", () => {
  setFilesDir(join("data-test-relative", "files"));
  const { ctx } = freshDb();
  const acc = createRecord(ctx(), "account", { name: "A" });
  const f = addFile(ctx(), "account", acc.id, { name: "a.txt", type: "text/plain", data: Buffer.from("x").toString("base64") });
  const { path } = readFile(ctx(), f.id);
  assert.ok(path.startsWith("/"));
  assert.equal(readFileSync(path, "utf8"), "x");
  rmSync("data-test-relative", { recursive: true });
  assert.throws(() => readFile(ctx(), f.id), /not found/i);
});

test("an email still succeeds when its contact was deleted", async () => {
  const { ctx } = freshDb();
  const con = createRecord(ctx(), "contact", { last_name: "Gone", email: "gone@x.test" });
  const c = createRecord(ctx(), "case", { subject: "S", contact: con.id });
  deleteRecord(ctx(), "contact", con.id);
  const msg = await sendEmail(ctx(), { object: "case", recordId: c.id, to: "gone@x.test", subject: "Hi", body: "B" });
  assert.equal(msg.status, "Sent");
});

test("stage changes made by an approval show in the feed", () => {
  const { ctx, db } = freshDb();
  saveProcess(db, { object: "opportunity", name: "All", criteria: "TRUE", approverType: "manager",
    approveActions: [{ field: "stage", value: "'Closed Won'" }] });
  const opp = createRecord(ctx("rep"), "opportunity", { name: "O", close_date: "2026-01-01" });
  const req = submit(ctx("rep"), "opportunity", opp.id);
  return import("../server/approvals.js").then(({ decide }) => {
    decide(ctx("manager"), req.id, "approve");
    const tracked = recordFeed(ctx(), "opportunity", opp.id).filter((i) => i.type === "tracked");
    assert.ok(tracked.some((t) => t.changes.some((c) => c.field === "stage" && c.to === "Closed Won")));
  });
});
