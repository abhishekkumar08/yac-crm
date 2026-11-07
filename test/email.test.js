import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { freshDb } from "./helpers.js";
import { renderMerge, sendEmail, saveTemplate, listTemplates, saveDeliverability, getDeliverability, setTransportFactory, listOutbox, emailDefaults, EmailError } from "../server/email.js";
import { createRecord, listRecords } from "../server/records.js";

afterEach(() => { setTransportFactory(null); delete process.env.CRM_SMTP_PASSWORD; });

function deal(ctx) {
  const acc = createRecord(ctx(), "account", { name: "Acme" });
  const con = createRecord(ctx(), "contact", { first_name: "Grace", last_name: "Lee", email: "grace@acme.test", account: acc.id });
  const opp = createRecord(ctx(), "opportunity", { name: "Acme Expansion", close_date: "2026-01-01", account: acc.id, contact: con.id });
  return { acc, con, opp };
}

test("merge fields pull from the record, its account and contact, and the sender", () => {
  const { ctx } = freshDb();
  const { opp } = deal(ctx);
  const out = renderMerge(ctx(), "Hi {!Contact.FirstName}, {!Opportunity.Name} for {!Account.Name}. — {!User.Name}", "opportunity", opp.id);
  assert.equal(out, "Hi Grace, Acme Expansion for Acme. — Ada Admin");
  assert.equal(renderMerge(ctx(), "x{!Contact.ShoeSize}y{!Planet.Name}z", "opportunity", opp.id), "xyz");
});

test("defaults suggest the related person's email", () => {
  const { ctx } = freshDb();
  const { opp } = deal(ctx);
  assert.deepEqual(emailDefaults(ctx(), "opportunity", opp.id).to, ["grace@acme.test"]);
});

test("by default email goes to the local outbox and is logged on the record", async () => {
  const { ctx } = freshDb();
  const { opp, con } = deal(ctx);
  const msg = await sendEmail(ctx(), { object: "opportunity", recordId: opp.id, to: "grace@acme.test", subject: "Hello {!Contact.FirstName}", body: "Body" });
  assert.equal(msg.status, "Sent");
  assert.equal(msg.transport, "outbox");
  assert.equal(msg.subject, "Hello Grace");
  assert.equal(listOutbox(ctx())[0].id, msg.id);
  const tasks = listRecords(ctx(), "task", { filters: [{ field: "what", op: "eq", value: opp.id }] }).records;
  assert.equal(tasks[0].type, "Email");
  assert.equal(tasks[0].status, "Completed");
  assert.equal(tasks[0].who, con.id);
});

test("SMTP sends through the transport when enabled and a password is set", async () => {
  const { ctx, db } = freshDb();
  const { opp } = deal(ctx);
  const sent = [];
  setTransportFactory(() => ({ sendMail: async (m) => { sent.push(m); return { messageId: "1" }; } }));
  saveDeliverability(db, { enabled: true, host: "smtp.example.test", port: 587, secure: false, user: "crm", from: "crm@example.test" });
  process.env.CRM_SMTP_PASSWORD = "test-only";
  const msg = await sendEmail(ctx(), { object: "opportunity", recordId: opp.id, to: ["grace@acme.test"], cc: "boss@acme.test", subject: "S", body: "B" });
  assert.equal(msg.status, "Sent");
  assert.equal(msg.transport, "smtp");
  assert.equal(sent[0].to, "grace@acme.test");
  assert.equal(sent[0].cc, "boss@acme.test");
  assert.equal(sent[0].from, "crm@example.test");
  assert.equal(getDeliverability(db).passwordSet, true);
});

test("SMTP without a password fails clearly and logs no activity", async () => {
  const { ctx, db } = freshDb();
  const { opp } = deal(ctx);
  saveDeliverability(db, { enabled: true, host: "smtp.example.test", port: 587, secure: false, user: "crm", from: "crm@example.test" });
  const msg = await sendEmail(ctx(), { object: "opportunity", recordId: opp.id, to: "grace@acme.test", subject: "S", body: "B" });
  assert.equal(msg.status, "Failed");
  assert.match(msg.error, /CRM_SMTP_PASSWORD/);
  assert.equal(listRecords(ctx(), "task", { filters: [{ field: "what", op: "eq", value: opp.id }] }).total, 0);
});

test("invalid addresses and missing recipients are rejected", async () => {
  const { ctx } = freshDb();
  const { opp } = deal(ctx);
  await assert.rejects(sendEmail(ctx(), { object: "opportunity", recordId: opp.id, to: "not-an-email", subject: "S", body: "B" }), EmailError);
  await assert.rejects(sendEmail(ctx(), { object: "opportunity", recordId: opp.id, to: "", subject: "S", body: "B" }), /recipient/);
});

test("enabling SMTP needs a host and port", () => {
  const { db } = freshDb();
  assert.throws(() => saveDeliverability(db, { enabled: true, host: "", port: 587 }), /host/);
});

test("templates need a name and subject", () => {
  const { db, admin } = freshDb();
  assert.throws(() => saveTemplate(db, admin, { name: "", subject: "x", body: "y" }), EmailError);
  saveTemplate(db, admin, { name: "Follow-up", object: "opportunity", subject: "Next steps for {!Opportunity.Name}", body: "Hi {!Contact.FirstName}" });
  assert.equal(listTemplates(db)[0].name, "Follow-up");
});

test("merge never reads related records the sender can't see", async () => {
  const { ctx, db } = freshDb();
  const { updateObject } = await import("../server/metadata.js");
  updateObject(db, "account", { sharing: "private" });
  const acc = createRecord(ctx("peer"), "account", { name: "Hidden Co" });
  const opp = createRecord(ctx("rep"), "opportunity", { name: "Mine", close_date: "2026-01-01", account: acc.id });
  assert.equal(renderMerge(ctx("rep"), "[{!Account.Name}]", "opportunity", opp.id), "[]");
  assert.equal(renderMerge(ctx("manager"), "[{!Account.Name}]", "opportunity", opp.id), "[Hidden Co]");
});
