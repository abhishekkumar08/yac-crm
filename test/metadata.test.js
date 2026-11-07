import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDb } from "./helpers.js";
import {
  listObjects, getObject, createObject, updateObject, createField, updateField, deleteField, saveLayout,
  listViews, createListView, updateListView, deleteListView, createValidationRule, createAutomation,
  MetadataError, APPS,
} from "../server/metadata.js";

test("seeds the standard objects with fields, layouts and list views", () => {
  const { db, admin } = freshDb();
  const names = listObjects(db).map((o) => o.name);
  for (const n of ["account", "contact", "lead", "opportunity", "opportunity_line_item", "product", "pricebook",
    "pricebook_entry", "quote", "quote_line_item", "campaign", "campaign_member", "case", "task", "event", "note"]) {
    assert.ok(names.includes(n), n);
  }
  const opp = getObject(db, "opportunity");
  assert.equal(opp.prefix, "006");
  assert.equal(opp.pathField, "stage");
  const stage = opp.fields.find((f) => f.name === "stage");
  assert.equal(stage.type, "picklist");
  assert.ok(stage.picklist.includes("Closed Won"));
  assert.ok(opp.layout.sections.length > 0);
  assert.ok(listViews(db, "opportunity", admin).some((v) => v.name === "All Opportunities"));
});

test("apps list tabs that are real objects or pages", () => {
  const { db } = freshDb();
  const names = new Set(listObjects(db).map((o) => o.name));
  for (const app of APPS) for (const tab of app.tabs) assert.ok(names.has(tab) || tab.startsWith("@"), tab);
});

test("getObject on an unknown object throws", () => {
  const { db } = freshDb();
  assert.throws(() => getObject(db, "nope"), MetadataError);
});

test("custom object gets an __c name, a prefix, a name field, a layout and an All view", () => {
  const { db, admin } = freshDb();
  const obj = createObject(db, { label: "Shipment", plural: "Shipments" });
  assert.equal(obj.name, "shipment__c");
  assert.equal(obj.custom, true);
  assert.match(obj.prefix, /^a[0-9a-z]{2}$/);
  assert.ok(obj.fields.some((f) => f.name === "name" && f.required));
  assert.deepEqual(obj.layout.sections[0].fields, ["name"]);
  assert.equal(listViews(db, "shipment__c", admin)[0].name, "All Shipments");
  assert.notEqual(createObject(db, { label: "Box", plural: "Boxes" }).prefix, obj.prefix);
});

test("custom object with an autonumber name", () => {
  const { db } = freshDb();
  const obj = createObject(db, { label: "Ticket", plural: "Tickets", nameType: "autonumber", nameFormat: "T-{0000}" });
  assert.deepEqual(obj.fields.find((f) => f.name === "name").autonumber, { format: "T-{0000}", next: 1 });
});

test("duplicate custom object rejected", () => {
  const { db } = freshDb();
  createObject(db, { label: "Shipment", plural: "Shipments" });
  assert.throws(() => createObject(db, { label: "Shipment", plural: "Shipments" }), /already exists/);
});

test("updateObject changes label and sharing", () => {
  const { db } = freshDb();
  updateObject(db, "case", { sharing: "private", label: "Ticket", plural: "Tickets" });
  const c = getObject(db, "case");
  assert.equal(c.sharing, "private");
  assert.equal(c.label, "Ticket");
  assert.throws(() => updateObject(db, "case", { sharing: "open" }), MetadataError);
});

test("custom field: __c name, added to the layout", () => {
  const { db } = freshDb();
  const f = createField(db, "account", { label: "Tier Level", type: "picklist", picklist: ["Gold", "Silver"] });
  assert.equal(f.name, "tier_level__c");
  assert.equal(f.custom, true);
  assert.ok(getObject(db, "account").layout.sections[0].fields.includes("tier_level__c"));
});

test("custom field rejects bad type, duplicate name, empty picklist and reserved names", () => {
  const { db } = freshDb();
  assert.throws(() => createField(db, "account", { label: "X", type: "blob" }), /Unknown field type/);
  createField(db, "account", { label: "Score", type: "number" });
  assert.throws(() => createField(db, "account", { label: "Score", type: "number" }), /already exists/);
  assert.throws(() => createField(db, "account", { label: "P", type: "picklist", picklist: [] }), /at least one value/);
  assert.throws(() => createField(db, "account", { name: "owner_id", label: "Owner", type: "text" }), /reserved/);
});

test("lookup field needs a real target object", () => {
  const { db } = freshDb();
  assert.throws(() => createField(db, "account", { label: "Ref", type: "lookup", referenceTo: "ghost" }), /Unknown object/);
  assert.equal(createField(db, "account", { label: "Partner", type: "lookup", referenceTo: "account" }).referenceTo, "account");
});

test("formula field is syntax- and field-checked", () => {
  const { db } = freshDb();
  assert.throws(() => createField(db, "opportunity", { label: "Bad", type: "formula", formula: "amount +", returnType: "currency" }), /position/);
  assert.throws(() => createField(db, "opportunity", { label: "Bad", type: "formula", formula: "amont * 2", returnType: "currency" }), /Unknown field amont/);
  const ok = createField(db, "opportunity", { label: "Double", type: "formula", formula: "amount * 2", returnType: "currency" });
  assert.equal(ok.returnType, "currency");
});

test("rollup field must point at a child lookup", () => {
  const { db } = freshDb();
  assert.throws(() => createField(db, "account", { label: "Open Value", type: "rollup",
    rollup: { child: "opportunity", via: "campaign", fn: "sum", field: "amount" } }), /does not look up account/);
  const f = createField(db, "account", { label: "Total Value", type: "rollup",
    rollup: { child: "opportunity", via: "account", fn: "sum", field: "amount" } });
  assert.deepEqual(f.rollup, { child: "opportunity", via: "account", fn: "sum", field: "amount", filter: null });
});

test("updateField edits label, picklist and required, but not type", () => {
  const { db } = freshDb();
  updateField(db, "lead", "rating", { label: "Temperature", picklist: ["Hot", "Warm", "Cold", "Frozen"], required: true });
  const f = getObject(db, "lead").fields.find((x) => x.name === "rating");
  assert.equal(f.label, "Temperature");
  assert.ok(f.picklist.includes("Frozen"));
  assert.equal(f.required, true);
  assert.throws(() => updateField(db, "lead", "rating", { type: "text" }), /cannot change/);
});

test("deleteField removes custom fields only, from layout and views too", () => {
  const { db, admin } = freshDb();
  createField(db, "account", { label: "Score", type: "number" });
  const view = createListView(db, admin, { object: "account", name: "Scored", columns: ["name", "score__c"] });
  deleteField(db, "account", "score__c");
  assert.ok(!getObject(db, "account").fields.some((f) => f.name === "score__c"));
  assert.ok(!getObject(db, "account").layout.sections.some((s) => s.fields.includes("score__c")));
  assert.deepEqual(listViews(db, "account", admin).find((v) => v.id === view.id).columns, ["name"]);
  assert.throws(() => deleteField(db, "account", "industry"), /standard field/);
});

test("saveLayout rejects unknown fields", () => {
  const { db } = freshDb();
  assert.throws(() => saveLayout(db, "account", { sections: [{ label: "A", fields: ["ghost"] }], related: [], highlights: [] }), /Unknown field ghost/);
  saveLayout(db, "account", { sections: [{ label: "Main", fields: ["name", "phone"] }], related: [], highlights: ["phone"] });
  assert.deepEqual(getObject(db, "account").layout.sections, [{ label: "Main", fields: ["name", "phone"] }]);
});

test("private list views are visible only to their owner", () => {
  const { db, rep, peer } = freshDb();
  const v = createListView(db, rep, { object: "lead", name: "Mine", shared: false, scope: "mine",
    filters: [{ field: "status", op: "eq", value: "Open - Not Contacted" }], columns: ["name", "company"] });
  assert.ok(listViews(db, "lead", rep).some((x) => x.id === v.id));
  assert.ok(!listViews(db, "lead", peer).some((x) => x.id === v.id));
  assert.throws(() => updateListView(db, peer, v.id, { name: "Hijack" }), /not allowed/);
  updateListView(db, rep, v.id, { name: "Mine 2" });
  deleteListView(db, rep, v.id);
  assert.ok(!listViews(db, "lead", rep).some((x) => x.id === v.id));
});

test("list view filters must name real fields", () => {
  const { db, rep } = freshDb();
  assert.throws(() => createListView(db, rep, { object: "lead", name: "X", filters: [{ field: "ghost", op: "eq", value: 1 }] }), /Unknown field ghost/);
});

test("validation rule and automation conditions are checked", () => {
  const { db } = freshDb();
  assert.throws(() => createValidationRule(db, { object: "opportunity", name: "x", condition: "amount <", message: "m" }), /position/);
  assert.ok(createValidationRule(db, { object: "opportunity", name: "Positive", condition: "amount < 0", message: "Amount must be positive", field: "amount" }).id);
  assert.throws(() => createAutomation(db, { object: "case", name: "x", trigger: "create", criteria: "TRUE",
    actions: [{ type: "explode" }] }), /Unknown action/);
  assert.ok(createAutomation(db, { object: "case", name: "Hot", trigger: "create", criteria: "ISPICKVAL(priority, 'High')",
    actions: [{ type: "create_task", subject: "Call customer", dueInDays: 1, assignTo: "owner" }] }).id);
});
