import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDb } from "./helpers.js";
import { createRecord, getRecord, listRecords, ValidationError } from "../server/records.js";
import { createValidationRule } from "../server/metadata.js";
import { convertLead } from "../server/convert.js";
import { createQuote } from "../server/quotes.js";

const newLead = (ctx) => createRecord(ctx, "lead", {
  first_name: "Grace", last_name: "Hopper", company: "Navy Labs", email: "grace@navy.test", phone: "555",
  title: "Rear Admiral", lead_source: "Web", address_city: "Arlington", industry: "Government",
});

test("creates account, contact and opportunity, and marks the lead converted", () => {
  const { ctx, rep } = freshDb();
  const lead = newLead(ctx("rep"));
  const out = convertLead(ctx("rep"), lead.id, { opportunityName: "Navy pilot" });
  const acc = getRecord(ctx(), "account", out.accountId);
  const con = getRecord(ctx(), "contact", out.contactId);
  const opp = getRecord(ctx(), "opportunity", out.opportunityId);
  assert.equal(acc.name, "Navy Labs");
  assert.equal(acc.billing_city, "Arlington");
  assert.equal(acc.industry, "Government");
  assert.equal(con.name, "Grace Hopper");
  assert.equal(con.email, "grace@navy.test");
  assert.equal(con.account, acc.id);
  assert.equal(opp.name, "Navy pilot");
  assert.equal(opp.account, acc.id);
  assert.equal(opp.contact, con.id);
  assert.equal(opp.lead_source, "Web");
  assert.equal(opp.ownerId, rep.id);
  const done = getRecord(ctx(), "lead", lead.id);
  assert.equal(done.is_converted, true);
  assert.equal(done.status, "Closed - Converted");
  assert.equal(done.converted_account, acc.id);
  assert.equal(done.converted_opportunity, opp.id);
  assert.ok(done.converted_date);
});

test("attaches to an existing account and can skip the opportunity", () => {
  const { ctx } = freshDb();
  const acc = createRecord(ctx(), "account", { name: "Existing" });
  const out = convertLead(ctx(), newLead(ctx()).id, { accountId: acc.id, createOpportunity: false });
  assert.equal(out.accountId, acc.id);
  assert.equal(out.opportunityId, null);
  assert.equal(listRecords(ctx(), "account", {}).total, 1);
});

test("moves the lead's activities to the new contact", () => {
  const { ctx } = freshDb();
  const lead = newLead(ctx());
  const task = createRecord(ctx(), "task", { subject: "Intro call", who: lead.id });
  const out = convertLead(ctx(), lead.id, {});
  const moved = getRecord(ctx(), "task", task.id);
  assert.equal(moved.who, out.contactId);
  assert.equal(moved.what, out.accountId);
});

test("a converted lead cannot be converted again", () => {
  const { ctx } = freshDb();
  const lead = newLead(ctx());
  convertLead(ctx(), lead.id, {});
  assert.throws(() => convertLead(ctx(), lead.id, {}), /already converted/);
});

test("a failure part-way leaves nothing behind", () => {
  const { ctx, db } = freshDb();
  createValidationRule(db, { object: "contact", name: "Phone", condition: "ISBLANK(mobile_phone)", message: "Mobile is required." });
  const lead = newLead(ctx());
  assert.throws(() => convertLead(ctx(), lead.id, {}), ValidationError);
  assert.equal(listRecords(ctx(), "account", {}).total, 0);
  assert.equal(getRecord(ctx(), "lead", lead.id).is_converted, false);
});

test("quote copies the opportunity's line items and totals", () => {
  const { ctx } = freshDb();
  const acc = createRecord(ctx(), "account", { name: "Acme" });
  const p1 = createRecord(ctx(), "product", { name: "Widget" });
  const p2 = createRecord(ctx(), "product", { name: "Gadget" });
  const opp = createRecord(ctx(), "opportunity", { name: "Big", close_date: "2026-06-01", account: acc.id });
  createRecord(ctx(), "opportunity_line_item", { opportunity: opp.id, product: p1.id, quantity: 2, unit_price: 50 });
  createRecord(ctx(), "opportunity_line_item", { opportunity: opp.id, product: p2.id, quantity: 1, unit_price: 25, discount: 20 });
  const q = createQuote(ctx(), opp.id, {});
  assert.equal(q.opportunity, opp.id);
  assert.equal(q.account, acc.id);
  assert.equal(q.status, "Draft");
  assert.equal(q.subtotal, 120);
  assert.equal(q.grand_total, 120);
  assert.equal(listRecords(ctx(), "quote_line_item", { filters: [{ field: "quote", op: "eq", value: q.id }] }).total, 2);
});
