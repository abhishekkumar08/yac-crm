import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDb } from "./helpers.js";
import { createRecord, updateRecord, listRecords, getRecord } from "../server/records.js";
import { createAutomation, updateAutomation } from "../server/metadata.js";

const tasksFor = (ctx, id) => listRecords(ctx, "task", { filters: [{ field: "what", op: "eq", value: id }] }).records;

test("create_task fires on a high-priority case, assigned to the owner", () => {
  const { ctx, db, rep } = freshDb();
  createAutomation(db, { object: "case", name: "Hot case", trigger: "create", criteria: "ISPICKVAL(priority, 'High')",
    actions: [{ type: "create_task", subject: "Call the customer", dueInDays: 1, assignTo: "owner" }] });
  const hot = createRecord(ctx("rep"), "case", { subject: "Down", priority: "High" });
  const calm = createRecord(ctx("rep"), "case", { subject: "Meh", priority: "Low" });
  const tasks = tasksFor(ctx(), hot.id);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].subject, "Call the customer");
  assert.equal(tasks[0].ownerId, rep.id);
  assert.ok(tasks[0].due_date);
  assert.equal(tasksFor(ctx(), calm.id).length, 0);
});

test("set_field uses an expression", () => {
  const { ctx, db } = freshDb();
  createAutomation(db, { object: "case", name: "Escalate", trigger: "create_or_update",
    criteria: "ISPICKVAL(status, 'Escalated')",
    actions: [{ type: "set_field", field: "is_escalated", value: "TRUE" }, { type: "set_field", field: "internal_comments", value: "'Escalated: ' & subject" }] });
  const c = createRecord(ctx(), "case", { subject: "Fire" });
  assert.equal(c.is_escalated, false);
  updateRecord(ctx(), "case", c.id, { status: "Escalated" });
  const read = getRecord(ctx(), "case", c.id);
  assert.equal(read.is_escalated, true);
  assert.equal(read.internal_comments, "Escalated: Fire");
});

test("update rules fire only when a record starts meeting the criteria", () => {
  const { ctx, db } = freshDb();
  createAutomation(db, { object: "case", name: "Follow up", trigger: "update", criteria: "ISPICKVAL(status, 'Working')",
    actions: [{ type: "create_task", subject: "Check in", dueInDays: 2, assignTo: "owner" }] });
  const c = createRecord(ctx(), "case", { subject: "S", status: "Working" });
  assert.equal(tasksFor(ctx(), c.id).length, 0);
  updateRecord(ctx(), "case", c.id, { status: "New" });
  updateRecord(ctx(), "case", c.id, { status: "Working" });
  updateRecord(ctx(), "case", c.id, { subject: "S2" });
  assert.equal(tasksFor(ctx(), c.id).length, 1);
});

test("inactive rules are ignored and an action matching its own criteria does not loop", () => {
  const { ctx, db } = freshDb();
  const off = createAutomation(db, { object: "lead", name: "Off", trigger: "create", criteria: "TRUE",
    actions: [{ type: "set_field", field: "rating", value: "'Hot'" }] });
  updateAutomation(db, off.id, { active: false });
  createAutomation(db, { object: "lead", name: "Self", trigger: "create_or_update", criteria: "TRUE",
    actions: [{ type: "set_field", field: "description", value: "BLANKVALUE(description, '') & 'x'" }] });
  const lead = createRecord(ctx(), "lead", { last_name: "L", company: "C" });
  const read = getRecord(ctx(), "lead", lead.id);
  assert.equal(read.rating, null);
  assert.equal(read.description, "x");
});

test("a set_field value that fails coercion is reported, not silently written", () => {
  const { ctx, db } = freshDb();
  createAutomation(db, { object: "opportunity", name: "Bad", trigger: "create", criteria: "TRUE",
    actions: [{ type: "set_field", field: "amount", value: "'lots'" }] });
  assert.throws(() => createRecord(ctx(), "opportunity", { name: "O", close_date: "2026-01-01" }), /Automation "Bad"/);
});
