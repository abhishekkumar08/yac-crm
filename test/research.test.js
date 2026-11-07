import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDb } from "./helpers.js";
import { getObject, syncStandardMetadata } from "../server/metadata.js";
import { createRecord, getRecord, listRecords, relatedLists, ForbiddenError } from "../server/records.js";
import { convertLead } from "../server/convert.js";
import { massUpdate } from "../server/mass.js";

test("sync adds a standard field missing from an older database, and places it on the layout", () => {
  const { db } = freshDb();
  db.prepare("DELETE FROM fields WHERE object = 'opportunity' AND name = 'is_private'").run();
  syncStandardMetadata(db);
  const opp = getObject(db, "opportunity");
  assert.ok(opp.fields.some((f) => f.name === "is_private"));
  assert.ok(opp.layout.sections.some((s) => s.fields.includes("is_private")));
});

test("sync adds a standard object missing from an older database", () => {
  const { db } = freshDb();
  for (const t of ["fields", "layouts", "list_views"]) db.prepare(`DELETE FROM ${t} WHERE object = 'opportunity_contact_role'`).run();
  db.prepare("DELETE FROM objects WHERE name = 'opportunity_contact_role'").run();
  syncStandardMetadata(db);
  assert.equal(getObject(db, "opportunity_contact_role").label, "Opportunity Contact Role");
});

test("sync leaves admin layout edits alone", () => {
  const { db } = freshDb();
  db.prepare("UPDATE layouts SET sections = ? WHERE object = 'account'").run(JSON.stringify([{ label: "Mine", fields: ["name"] }]));
  syncStandardMetadata(db);
  assert.deepEqual(getObject(db, "account").layout.sections, [{ label: "Mine", fields: ["name"] }]);
});

test("a private opportunity is hidden from peers but visible to the owner's manager", () => {
  const { ctx } = freshDb();
  const opp = createRecord(ctx("rep"), "opportunity", { name: "Secret", close_date: "2026-01-01", is_private: true });
  assert.throws(() => getRecord(ctx("peer"), "opportunity", opp.id), ForbiddenError);
  assert.equal(listRecords(ctx("peer"), "opportunity", {}).total, 0);
  assert.equal(getRecord(ctx("manager"), "opportunity", opp.id).name, "Secret");
  const open = createRecord(ctx("rep"), "opportunity", { name: "Open", close_date: "2026-01-01" });
  assert.equal(getRecord(ctx("peer"), "opportunity", open.id).name, "Open");
});

test("opportunity quantity sums its products", () => {
  const { ctx } = freshDb();
  const p = createRecord(ctx(), "product", { name: "W" });
  const opp = createRecord(ctx(), "opportunity", { name: "O", close_date: "2026-01-01" });
  createRecord(ctx(), "opportunity_line_item", { opportunity: opp.id, product: p.id, quantity: 3, unit_price: 1 });
  createRecord(ctx(), "opportunity_line_item", { opportunity: opp.id, product: p.id, quantity: 4, unit_price: 1 });
  assert.equal(getRecord(ctx(), "opportunity", opp.id).total_quantity, 7);
});

test("a case created as closed is flagged closed-when-created", () => {
  const { ctx } = freshDb();
  assert.equal(createRecord(ctx(), "case", { subject: "A", status: "Closed" }).is_closed_on_create, true);
  assert.equal(createRecord(ctx(), "case", { subject: "B" }).is_closed_on_create, false);
});

test("conversion can reuse an existing contact and opportunity and set the converted status", () => {
  const { ctx } = freshDb();
  const acc = createRecord(ctx(), "account", { name: "Acme" });
  const con = createRecord(ctx(), "contact", { last_name: "Known", account: acc.id });
  const opp = createRecord(ctx(), "opportunity", { name: "Existing deal", close_date: "2026-01-01", account: acc.id });
  const lead = createRecord(ctx(), "lead", { last_name: "Known", company: "Acme" });
  const out = convertLead(ctx(), lead.id, { accountId: acc.id, contactId: con.id, opportunityId: opp.id, convertedStatus: "Closed - Converted" });
  assert.deepEqual(out, { accountId: acc.id, contactId: con.id, opportunityId: opp.id });
  assert.equal(listRecords(ctx(), "contact", {}).total, 1);
  assert.equal(listRecords(ctx(), "opportunity", {}).total, 1);
  assert.equal(getRecord(ctx(), "lead", lead.id).converted_opportunity, opp.id);
});

test("conversion rejects a status that is not a converted status", () => {
  const { ctx } = freshDb();
  const lead = createRecord(ctx(), "lead", { last_name: "L", company: "C" });
  assert.throws(() => convertLead(ctx(), lead.id, { convertedStatus: "Working - Contacted" }), /converted status/);
});

test("contact roles show on the opportunity", () => {
  const { ctx } = freshDb();
  const con = createRecord(ctx(), "contact", { last_name: "Buyer" });
  const opp = createRecord(ctx(), "opportunity", { name: "O", close_date: "2026-01-01" });
  createRecord(ctx(), "opportunity_contact_role", { opportunity: opp.id, contact: con.id, role: "Decision Maker", is_primary: true });
  const roles = relatedLists(ctx(), "opportunity", opp.id).find((r) => r.object === "opportunity_contact_role");
  assert.equal(roles.total, 1);
  assert.equal(roles.label, "Contact Roles");
});

test("mass change status and add to campaign", () => {
  const { ctx } = freshDb();
  const leads = [1, 2].map((i) => createRecord(ctx("rep"), "lead", { last_name: `L${i}`, company: "C" }));
  const res = massUpdate(ctx("rep"), "lead", { ids: leads.map((l) => l.id), action: "set", values: { status: "Working - Contacted" } });
  assert.equal(res.ok.length, 2);
  assert.equal(getRecord(ctx(), "lead", leads[0].id).status, "Working - Contacted");
  const camp = createRecord(ctx(), "campaign", { name: "Spring" });
  massUpdate(ctx("rep"), "lead", { ids: leads.map((l) => l.id), action: "add_to_campaign", campaignId: camp.id });
  assert.equal(getRecord(ctx(), "campaign", camp.id).number_of_members, 2);
  const again = massUpdate(ctx("rep"), "lead", { ids: [leads[0].id], action: "add_to_campaign", campaignId: camp.id });
  assert.match(again.failed[0].error, /already a member/);
});

test("mass set rejects an invalid value per record", () => {
  const { ctx } = freshDb();
  const lead = createRecord(ctx(), "lead", { last_name: "L", company: "C" });
  const res = massUpdate(ctx(), "lead", { ids: [lead.id], action: "set", values: { status: "Bogus" } });
  assert.match(res.failed[0].error, /not an allowed value/);
});
