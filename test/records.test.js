import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDb } from "./helpers.js";
import {
  createRecord, updateRecord, getRecord, listRecords, deleteRecord, restoreRecord, recycleBin, relatedLists,
  timeline, fieldHistory, ValidationError, ForbiddenError, NotFoundError,
} from "../server/records.js";
import { createField, createValidationRule, updateObject, createObject } from "../server/metadata.js";

const errorsOf = (fn) => {
  try { fn(); } catch (e) { if (e instanceof ValidationError) return e.errors; throw e; }
  assert.fail("expected a ValidationError");
};

test("create assigns id with the object prefix, owner, timestamps and name", () => {
  const { ctx, admin } = freshDb();
  const acc = createRecord(ctx(), "account", { name: "Acme", industry: "Banking" });
  assert.match(acc.id, /^001/);
  assert.equal(acc.name, "Acme");
  assert.equal(acc.ownerId, admin.id);
  assert.equal(acc.$names.owner, admin.name);
  assert.ok(acc.createdAt);
});

test("required and type errors are reported per field", () => {
  const { ctx } = freshDb();
  const errors = errorsOf(() => createRecord(ctx(), "opportunity", { name: "", amount: "lots", stage: "Nope" }));
  assert.equal(errors.name, "Complete this field.");
  assert.equal(errors.amount, "Enter a number.");
  assert.match(errors.stage, /not an allowed value/);
  assert.equal(errors.close_date, "Complete this field.");
});

test("defaults apply on create", () => {
  const { ctx } = freshDb();
  const lead = createRecord(ctx(), "lead", { last_name: "Lee", company: "Co" });
  assert.equal(lead.status, "Open - Not Contacted");
  assert.equal(lead.name, "Lee");
});

test("unknown fields and readonly fields are rejected", () => {
  const { ctx } = freshDb();
  assert.match(errorsOf(() => createRecord(ctx(), "account", { name: "A", ghost: 1 }))._record, /Unknown field ghost/);
  assert.match(errorsOf(() => createRecord(ctx(), "lead", { last_name: "L", company: "C", is_converted: true })).is_converted, /read-only/);
});

test("lookups must point at a record of the right object", () => {
  const { ctx } = freshDb();
  const acc = createRecord(ctx(), "account", { name: "Acme" });
  assert.match(errorsOf(() => createRecord(ctx(), "contact", { last_name: "X", account: "001doesnotexist" })).account, /valid/);
  const lead = createRecord(ctx(), "lead", { last_name: "L", company: "C" });
  assert.match(errorsOf(() => createRecord(ctx(), "contact", { last_name: "X", account: lead.id })).account, /valid/);
  const c = createRecord(ctx(), "contact", { first_name: "Jo", last_name: "X", account: acc.id });
  assert.equal(c.name, "Jo X");
  assert.equal(c.$names.account, "Acme");
});

test("formula fields are computed and stored", () => {
  const { ctx, db } = freshDb();
  const opp = createRecord(ctx(), "opportunity", { name: "O", stage: "Value Proposition", close_date: "2026-03-01", amount: 1000 });
  assert.equal(opp.expected_revenue, 500);
  const stored = JSON.parse(db.prepare("SELECT data FROM records WHERE id = ?").get(opp.id).data);
  assert.equal(stored.expected_revenue, 500);
});

test("formulas using TODAY are fresh on read", () => {
  const { ctx, db } = freshDb();
  createField(db, "opportunity", { label: "Days Left", type: "formula", formula: "close_date - TODAY()", returnType: "number" });
  const opp = createRecord(ctx(), "opportunity", { name: "O", close_date: "2030-01-10" });
  const read = getRecord({ ...ctx(), today: new Date("2030-01-01T12:00:00") }, "opportunity", opp.id);
  assert.equal(read.days_left__c, 9);
});

test("opportunity stage sets probability, forecast category and closed/won", () => {
  const { ctx } = freshDb();
  const opp = createRecord(ctx(), "opportunity", { name: "O", close_date: "2026-03-01", stage: "Negotiation/Review" });
  assert.equal(opp.probability, 90);
  assert.equal(opp.forecast_category, "Commit");
  const won = updateRecord(ctx(), "opportunity", opp.id, { stage: "Closed Won" });
  assert.equal(won.is_closed, true);
  assert.equal(won.is_won, true);
  assert.equal(won.probability, 100);
  const kept = updateRecord(ctx(), "opportunity", opp.id, { stage: "Prospecting", probability: 35 });
  assert.equal(kept.probability, 35);
});

test("case closed date follows status", () => {
  const { ctx } = freshDb();
  const c = createRecord(ctx(), "case", { subject: "Broken" });
  assert.match(c.case_number, /^\d{8}$/);
  assert.equal(c.name, c.case_number);
  const closed = updateRecord(ctx(), "case", c.id, { status: "Closed" });
  assert.ok(closed.closed_date);
  assert.equal(updateRecord(ctx(), "case", c.id, { status: "Working" }).closed_date, null);
});

test("autonumber increments", () => {
  const { ctx } = freshDb();
  const a = createRecord(ctx(), "case", { subject: "A" });
  const b = createRecord(ctx(), "case", { subject: "B" });
  assert.equal(Number(b.case_number), Number(a.case_number) + 1);
});

test("validation rule blocks save with its message on its field", () => {
  const { ctx, db } = freshDb();
  createValidationRule(db, { object: "opportunity", name: "Positive", condition: "amount < 0", message: "Amount must be positive.", field: "amount" });
  assert.equal(errorsOf(() => createRecord(ctx(), "opportunity", { name: "O", close_date: "2026-01-01", amount: -5 })).amount, "Amount must be positive.");
  const ev = errorsOf(() => createRecord(ctx(), "event", { subject: "S", start: "2026-01-02T10:00:00Z", end: "2026-01-02T09:00:00Z" }));
  assert.equal(ev.end, "End must be after start.");
});

test("validation rule can use ISCHANGED and PRIORVALUE", () => {
  const { ctx, db } = freshDb();
  createValidationRule(db, { object: "opportunity", name: "No reopen", condition: "ISCHANGED(stage) && PRIORVALUE(stage) = 'Closed Won'", message: "Won deals stay won." });
  const opp = createRecord(ctx(), "opportunity", { name: "O", close_date: "2026-01-01", stage: "Closed Won" });
  assert.equal(errorsOf(() => updateRecord(ctx(), "opportunity", opp.id, { stage: "Prospecting" }))._record, "Won deals stay won.");
});

test("unique fields", () => {
  const { ctx, db } = freshDb();
  createField(db, "account", { label: "Tax Id", type: "text", unique: true });
  createRecord(ctx(), "account", { name: "A", tax_id__c: "X1" });
  assert.match(errorsOf(() => createRecord(ctx(), "account", { name: "B", tax_id__c: "x1" })).tax_id__c, /already uses/);
});

test("history records old and new values per changed field", () => {
  const { ctx } = freshDb();
  const acc = createRecord(ctx(), "account", { name: "Acme", rating: "Cold" });
  updateRecord(ctx(), "account", acc.id, { rating: "Hot", phone: "123" });
  const h = fieldHistory(ctx(), acc.id);
  const rating = h.find((x) => x.field === "rating");
  assert.equal(rating.oldValue, "Cold");
  assert.equal(rating.newValue, "Hot");
  assert.equal(rating.userName, "Ada Admin");
  assert.ok(h.some((x) => x.field === "phone"));
  assert.ok(h.some((x) => x.field === "created"));
});

test("roll-up summary recalculates the parent on child create, update and delete", () => {
  const { ctx, db } = freshDb();
  createField(db, "account", { label: "Pipeline", type: "rollup", rollup: { child: "opportunity", via: "account", fn: "sum", field: "amount" } });
  createField(db, "account", { label: "Open Count", type: "rollup", rollup: { child: "opportunity", via: "account", fn: "count", filter: "!is_closed" } });
  const acc = createRecord(ctx(), "account", { name: "Acme" });
  const o1 = createRecord(ctx(), "opportunity", { name: "1", close_date: "2026-01-01", amount: 100, account: acc.id });
  createRecord(ctx(), "opportunity", { name: "2", close_date: "2026-01-01", amount: 50, account: acc.id, stage: "Closed Won" });
  let a = getRecord(ctx(), "account", acc.id);
  assert.equal(a.pipeline__c, 150);
  assert.equal(a.open_count__c, 1);
  updateRecord(ctx(), "opportunity", o1.id, { amount: 300 });
  assert.equal(getRecord(ctx(), "account", acc.id).pipeline__c, 350);
  deleteRecord(ctx(), "opportunity", o1.id);
  a = getRecord(ctx(), "account", acc.id);
  assert.equal(a.pipeline__c, 50);
  assert.equal(a.open_count__c, 0);
});

test("moving a child to another parent recalculates both", () => {
  const { ctx, db } = freshDb();
  createField(db, "account", { label: "Pipeline", type: "rollup", rollup: { child: "opportunity", via: "account", fn: "sum", field: "amount" } });
  const a = createRecord(ctx(), "account", { name: "A" });
  const b = createRecord(ctx(), "account", { name: "B" });
  const o = createRecord(ctx(), "opportunity", { name: "1", close_date: "2026-01-01", amount: 10, account: a.id });
  updateRecord(ctx(), "opportunity", o.id, { account: b.id });
  assert.equal(getRecord(ctx(), "account", a.id).pipeline__c, 0);
  assert.equal(getRecord(ctx(), "account", b.id).pipeline__c, 10);
});

test("opportunity amount follows its line items", () => {
  const { ctx } = freshDb();
  const prod = createRecord(ctx(), "product", { name: "Widget" });
  const opp = createRecord(ctx(), "opportunity", { name: "O", close_date: "2026-01-01", amount: 5 });
  const li = createRecord(ctx(), "opportunity_line_item", { opportunity: opp.id, product: prod.id, quantity: 2, unit_price: 100, discount: 10 });
  assert.equal(li.name, "Widget");
  assert.equal(li.total_price, 180);
  assert.equal(getRecord(ctx(), "opportunity", opp.id).amount, 180);
});

test("quote totals roll up from line items", () => {
  const { ctx } = freshDb();
  const prod = createRecord(ctx(), "product", { name: "Widget" });
  const opp = createRecord(ctx(), "opportunity", { name: "O", close_date: "2026-01-01" });
  const q = createRecord(ctx(), "quote", { name: "Q", opportunity: opp.id, tax: 5 });
  createRecord(ctx(), "quote_line_item", { quote: q.id, product: prod.id, quantity: 3, unit_price: 10 });
  const read = getRecord(ctx(), "quote", q.id);
  assert.equal(read.subtotal, 30);
  assert.equal(read.grand_total, 35);
});

test("soft delete hides, recycle bin lists, restore brings back", () => {
  const { ctx } = freshDb();
  const acc = createRecord(ctx(), "account", { name: "Acme" });
  deleteRecord(ctx(), "account", acc.id);
  assert.throws(() => getRecord(ctx(), "account", acc.id), NotFoundError);
  assert.equal(listRecords(ctx(), "account", {}).total, 0);
  assert.deepEqual(recycleBin(ctx()).map((r) => r.id), [acc.id]);
  restoreRecord(ctx(), acc.id);
  assert.equal(getRecord(ctx(), "account", acc.id).name, "Acme");
  assert.equal(recycleBin(ctx()).length, 0);
});

test("delete cascades to line items and restore brings them back", () => {
  const { ctx, db } = freshDb();
  const prod = createRecord(ctx(), "product", { name: "W" });
  const opp = createRecord(ctx(), "opportunity", { name: "O", close_date: "2026-01-01" });
  const li = createRecord(ctx(), "opportunity_line_item", { opportunity: opp.id, product: prod.id, quantity: 1, unit_price: 1 });
  deleteRecord(ctx(), "opportunity", opp.id);
  assert.ok(db.prepare("SELECT deleted_at FROM records WHERE id = ?").get(li.id).deleted_at);
  assert.deepEqual(recycleBin(ctx()).map((r) => r.id), [opp.id]);
  restoreRecord(ctx(), opp.id);
  assert.equal(db.prepare("SELECT deleted_at FROM records WHERE id = ?").get(li.id).deleted_at, null);
});

test("sharing: a rep cannot read or edit a private record of a peer", () => {
  const { ctx, db } = freshDb();
  updateObject(db, "account", { sharing: "private" });
  const acc = createRecord(ctx("peer"), "account", { name: "Secret" });
  assert.throws(() => getRecord(ctx("rep"), "account", acc.id), ForbiddenError);
  assert.throws(() => updateRecord(ctx("rep"), "account", acc.id, { name: "X" }), ForbiddenError);
  assert.throws(() => deleteRecord(ctx("rep"), "account", acc.id), ForbiddenError);
  assert.equal(getRecord(ctx("manager"), "account", acc.id).name, "Secret");
});

test("sharing applies to related lists and timeline", () => {
  const { ctx, db } = freshDb();
  const acc = createRecord(ctx(), "account", { name: "Shared" });
  updateObject(db, "opportunity", { sharing: "private" });
  updateObject(db, "task", { sharing: "private" });
  createRecord(ctx("peer"), "opportunity", { name: "Peer deal", close_date: "2026-01-01", account: acc.id });
  createRecord(ctx("peer"), "task", { subject: "Peer task", what: acc.id });
  const opps = relatedLists(ctx("rep"), "account", acc.id).find((r) => r.object === "opportunity");
  assert.equal(opps.total, 0);
  assert.equal(relatedLists(ctx("manager"), "account", acc.id).find((r) => r.object === "opportunity").total, 1);
  assert.equal(timeline(ctx("rep"), acc.id).length, 0);
});

test("owner change needs an active user", () => {
  const { ctx, rep } = freshDb();
  const acc = createRecord(ctx(), "account", { name: "A" });
  assert.equal(updateRecord(ctx(), "account", acc.id, { ownerId: rep.id }).ownerId, rep.id);
  assert.match(errorsOf(() => updateRecord(ctx(), "account", acc.id, { ownerId: "u_ghost" })).owner, /active user/);
});

test("listRecords applies a saved view and attaches lookup names in one pass", () => {
  const { ctx } = freshDb();
  const acc = createRecord(ctx(), "account", { name: "Acme" });
  for (let i = 0; i < 3; i++) createRecord(ctx(), "contact", { last_name: `C${i}`, account: acc.id });
  const page = listRecords(ctx(), "contact", { sort: { field: "last_name", dir: "asc" }, limit: 2 });
  assert.equal(page.total, 3);
  assert.deepEqual(page.records.map((r) => r.last_name), ["C0", "C1"]);
  assert.equal(page.records[0].$names.account, "Acme");
});

test("timeline shows open and done activities for the record", () => {
  const { ctx } = freshDb();
  const c = createRecord(ctx(), "contact", { last_name: "Lee" });
  createRecord(ctx(), "task", { subject: "Call", who: c.id, status: "Completed", type: "Call" });
  createRecord(ctx(), "task", { subject: "Follow up", who: c.id, due_date: "2030-01-01" });
  createRecord(ctx(), "note", { title: "Met at expo", what: c.id });
  const items = timeline(ctx(), c.id);
  assert.equal(items.length, 3);
  assert.ok(items.every((i) => ["task", "event", "note"].includes(i.object)));
});

test("custom object records work end to end", () => {
  const { ctx, db } = freshDb();
  const obj = createObject(db, { label: "Shipment", plural: "Shipments", nameType: "autonumber", nameFormat: "SH-{000}" });
  const r = createRecord(ctx(), obj.name, {});
  assert.equal(r.name, "SH-001");
  assert.match(r.id, new RegExp(`^${obj.prefix}`));
});

test("a failed save writes nothing", () => {
  const { ctx, db } = freshDb();
  createValidationRule(db, { object: "contact", name: "Need email", condition: "ISBLANK(email)", message: "Email is required." });
  const before = db.prepare("SELECT count(*) AS n FROM records").get().n;
  assert.throws(() => createRecord(ctx(), "contact", { last_name: "X" }), ValidationError);
  assert.equal(db.prepare("SELECT count(*) AS n FROM records").get().n, before);
  assert.equal(db.prepare("SELECT count(*) AS n FROM field_history").get().n, 0);
});
