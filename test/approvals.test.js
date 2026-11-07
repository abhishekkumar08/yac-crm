import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDb } from "./helpers.js";
import { saveProcess, listProcesses, submit, decide, recall, pendingFor, historyFor, ApprovalError } from "../server/approvals.js";
import { createRecord, updateRecord, deleteRecord, getRecord, ForbiddenError } from "../server/records.js";
import { listNotifications } from "../server/notifications.js";

function setup() {
  const env = freshDb();
  saveProcess(env.db, {
    object: "opportunity", name: "Big discount", criteria: "amount > 1000", approverType: "manager", lockRecord: true,
    approveActions: [{ field: "next_step", value: "'Approved by manager'" }],
    rejectActions: [{ field: "stage", value: "'Closed Lost'" }],
  });
  const opp = createRecord(env.ctx("rep"), "opportunity", { name: "Big", close_date: "2026-01-01", amount: 5000 });
  return { ...env, opp };
}

test("processes are validated", () => {
  const { db } = freshDb();
  assert.throws(() => saveProcess(db, { object: "opportunity", name: "x", criteria: "amount >", approverType: "manager" }), /position/);
  assert.throws(() => saveProcess(db, { object: "opportunity", name: "x", criteria: "TRUE", approverType: "user" }), /Choose the approver/);
  assert.throws(() => saveProcess(db, { object: "opportunity", name: "x", criteria: "TRUE", approverType: "manager", approveActions: [{ field: "is_won", value: "TRUE" }] }), /cannot be set/);
  assert.equal(listProcesses(db, "opportunity").length, 0);
});

test("submit routes to the submitter's manager and notifies them", () => {
  const { ctx, opp, manager } = setup();
  const req = submit(ctx("rep"), "opportunity", opp.id, "Please approve");
  assert.equal(req.approverId, manager.id);
  assert.equal(req.status, "pending");
  assert.deepEqual(pendingFor(ctx("manager")).map((r) => r.recordId), [opp.id]);
  assert.match(listNotifications(ctx("manager")).items[0].title, /requested approval/);
});

test("records outside the criteria can't be submitted", () => {
  const { ctx } = setup();
  const small = createRecord(ctx("rep"), "opportunity", { name: "Small", close_date: "2026-01-01", amount: 10 });
  assert.throws(() => submit(ctx("rep"), "opportunity", small.id), /No approval process applies/);
});

test("no manager gives a clear error", () => {
  const { ctx, db } = freshDb();
  saveProcess(db, { object: "account", name: "Any", criteria: "TRUE", approverType: "manager" });
  const acc = createRecord(ctx(), "account", { name: "A" });
  assert.throws(() => submit(ctx("admin"), "account", acc.id), /no manager/i);
});

test("a pending record can't be submitted twice", () => {
  const { ctx, opp } = setup();
  submit(ctx("rep"), "opportunity", opp.id);
  assert.throws(() => submit(ctx("rep"), "opportunity", opp.id), ApprovalError);
});

test("a locked record blocks edits and deletes except for the approver and admins", () => {
  const { ctx, opp } = setup();
  submit(ctx("rep"), "opportunity", opp.id);
  assert.throws(() => updateRecord(ctx("rep"), "opportunity", opp.id, { amount: 1 }), ForbiddenError);
  assert.throws(() => deleteRecord(ctx("rep"), "opportunity", opp.id), ForbiddenError);
  assert.equal(updateRecord(ctx("manager"), "opportunity", opp.id, { next_step: "check" }).next_step, "check");
  assert.equal(updateRecord(ctx("admin"), "opportunity", opp.id, { next_step: "ok" }).next_step, "ok");
});

test("approve runs the approval actions, unlocks, and notifies the submitter", () => {
  const { ctx, opp } = setup();
  const req = submit(ctx("rep"), "opportunity", opp.id);
  assert.throws(() => decide(ctx("peer"), req.id, "approve"), /only the approver/i);
  decide(ctx("manager"), req.id, "approve", "Fine");
  assert.equal(getRecord(ctx(), "opportunity", opp.id).next_step, "Approved by manager");
  assert.equal(updateRecord(ctx("rep"), "opportunity", opp.id, { amount: 4000 }).amount, 4000);
  assert.match(listNotifications(ctx("rep")).items[0].title, /approved/);
  const hist = historyFor(ctx("rep"), "opportunity", opp.id);
  assert.deepEqual(hist[0].steps.map((s) => s.action), ["submitted", "approved"]);
  assert.equal(hist[0].steps[1].comment, "Fine");
});

test("reject runs the rejection actions", () => {
  const { ctx, opp } = setup();
  const req = submit(ctx("rep"), "opportunity", opp.id);
  decide(ctx("manager"), req.id, "reject", "Too deep");
  assert.equal(getRecord(ctx(), "opportunity", opp.id).stage, "Closed Lost");
  assert.equal(historyFor(ctx(), "opportunity", opp.id)[0].status, "rejected");
});

test("only the submitter or an admin can recall", () => {
  const { ctx, opp } = setup();
  const req = submit(ctx("rep"), "opportunity", opp.id);
  assert.throws(() => recall(ctx("manager"), req.id), /submitter/i);
  recall(ctx("rep"), req.id, "Changed my mind");
  assert.equal(pendingFor(ctx("manager")).length, 0);
  assert.equal(updateRecord(ctx("rep"), "opportunity", opp.id, { amount: 2000 }).amount, 2000);
});

test("named-user approver", () => {
  const { ctx, db, support } = freshDb();
  saveProcess(db, { object: "case", name: "Refund", criteria: "TRUE", approverType: "user", approverId: support.id, lockRecord: false });
  const c = createRecord(ctx("rep"), "case", { subject: "Refund please" });
  assert.equal(submit(ctx("rep"), "case", c.id).approverId, support.id);
  assert.equal(updateRecord(ctx("rep"), "case", c.id, { priority: "High" }).priority, "High");
});
