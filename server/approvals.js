import { newId, now, tx } from "./db.js";
import { check } from "./expr.js";
import { getObject, isAdmin } from "./metadata.js";
import { getRecord, updateRecord, resolveNames, cachedCompile, ForbiddenError } from "./records.js";
import { canEdit } from "./sharing.js";
import { notify } from "./notifications.js";

export class ApprovalError extends Error {}

const parse = (v) => JSON.parse(v ?? "[]");
const processFromRow = (r) => ({ id: r.id, object: r.object, name: r.name, criteria: r.criteria, approverType: r.approver_type,
  approverId: r.approver_id, lockRecord: Boolean(r.lock_record), approveActions: parse(r.approve_actions),
  rejectActions: parse(r.reject_actions), active: Boolean(r.active), sort: r.sort });
const requestFromRow = (r) => ({ id: r.id, processId: r.process_id, object: r.object, recordId: r.record_id, status: r.status,
  submittedBy: r.submitted_by, approverId: r.approver_id, submittedAt: r.submitted_at, decidedAt: r.decided_at });

function checkExpr(fields, src) {
  const result = check(src, fields.map((f) => f.name));
  if (!result.ok) throw new ApprovalError(result.error);
}

function validateActions(fields, actions = []) {
  for (const a of actions) {
    const target = fields.find((f) => f.name === a.field);
    if (!target || target.readonly || target.system) throw new ApprovalError(`${a.field} cannot be set by an approval.`);
    checkExpr(fields, a.value);
  }
}

export function listProcesses(db, object) {
  const rows = object
    ? db.prepare("SELECT * FROM approval_processes WHERE object = ? ORDER BY sort, name").all(object)
    : db.prepare("SELECT * FROM approval_processes ORDER BY object, sort, name").all();
  return rows.map(processFromRow);
}

export function saveProcess(db, def) {
  const { fields } = getObject(db, def.object);
  if (!String(def.name ?? "").trim()) throw new ApprovalError("Enter a process name.");
  checkExpr(fields, def.criteria || "TRUE");
  if (!["manager", "user"].includes(def.approverType)) throw new ApprovalError("Choose who approves.");
  if (def.approverType === "user" && !db.prepare("SELECT 1 FROM users WHERE id = ? AND active = 1").get(def.approverId ?? "")) {
    throw new ApprovalError("Choose the approver.");
  }
  validateActions(fields, def.approveActions);
  validateActions(fields, def.rejectActions);
  const values = [def.object, def.name.trim(), def.criteria || "TRUE", def.approverType, def.approverType === "user" ? def.approverId : null,
    def.lockRecord === false ? 0 : 1, JSON.stringify(def.approveActions ?? []), JSON.stringify(def.rejectActions ?? []),
    def.active === false ? 0 : 1, Number(def.sort ?? 0)];
  if (def.id) {
    db.prepare(`UPDATE approval_processes SET object = ?, name = ?, criteria = ?, approver_type = ?, approver_id = ?,
      lock_record = ?, approve_actions = ?, reject_actions = ?, active = ?, sort = ? WHERE id = ?`).run(...values, def.id);
    return processFromRow(db.prepare("SELECT * FROM approval_processes WHERE id = ?").get(def.id));
  }
  const id = newId("04a");
  db.prepare(`INSERT INTO approval_processes (object, name, criteria, approver_type, approver_id, lock_record, approve_actions,
    reject_actions, active, sort, id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...values, id);
  return processFromRow(db.prepare("SELECT * FROM approval_processes WHERE id = ?").get(id));
}

export function deleteProcess(db, id) {
  if (db.prepare("SELECT 1 FROM approval_requests WHERE process_id = ? AND status = 'pending'").get(id)) {
    throw new ApprovalError("Some records are still waiting on this process.");
  }
  db.prepare("DELETE FROM approval_processes WHERE id = ?").run(id);
}

function managerOf(db, userId) {
  return db.prepare(`SELECT u.id FROM users me JOIN roles r ON r.id = me.role_id JOIN users u ON u.role_id = r.parent_id
    WHERE me.id = ? AND u.active = 1 ORDER BY u.name LIMIT 1`).get(userId)?.id ?? null;
}

const pendingRow = (db, recordId) => db.prepare("SELECT * FROM approval_requests WHERE record_id = ? AND status = 'pending'").get(recordId);
const userName = (db, id) => db.prepare("SELECT name FROM users WHERE id = ?").get(id)?.name ?? "";
const linkFor = (object, id) => `/r/${object}/${id}`;

function addHistory(db, requestId, action, actorId, comment) {
  db.prepare("INSERT INTO approval_history (request_id, action, actor_id, comment, at) VALUES (?, ?, ?, ?, ?)")
    .run(requestId, action, actorId, comment || null, now());
}

export function submit(ctx, object, recordId, comment) {
  const record = getRecord(ctx, object, recordId);
  if (!canEdit(ctx.db, ctx.user, record)) throw new ForbiddenError("You can't submit a record you can't edit.");
  if (pendingRow(ctx.db, recordId)) throw new ApprovalError("This record is already waiting for approval.");
  const process = listProcesses(ctx.db, object).find((p) => p.active && cachedCompile(p.criteria)(record, { today: ctx.today }));
  if (!process) throw new ApprovalError("No approval process applies to this record.");
  const approverId = process.approverType === "user" ? process.approverId : managerOf(ctx.db, ctx.user.id);
  if (!approverId) throw new ApprovalError("There's no manager to approve this. Ask an admin to set your role.");
  return tx(ctx.db, () => {
    const id = newId("04i");
    ctx.db.prepare(`INSERT INTO approval_requests (id, process_id, object, record_id, status, submitted_by, approver_id, submitted_at)
      VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`).run(id, process.id, object, recordId, ctx.user.id, approverId, now());
    addHistory(ctx.db, id, "submitted", ctx.user.id, comment);
    notify(ctx.db, approverId, { type: "approval", title: `${userName(ctx.db, ctx.user.id)} requested approval for ${record.name ?? ""}`,
      body: comment || null, link: linkFor(object, recordId) });
    return requestFromRow(ctx.db.prepare("SELECT * FROM approval_requests WHERE id = ?").get(id));
  });
}

function pendingRequest(ctx, requestId) {
  const row = ctx.db.prepare("SELECT * FROM approval_requests WHERE id = ? AND status = 'pending'").get(requestId);
  if (!row) throw new ApprovalError("That approval request is no longer pending.");
  return row;
}

export function decide(ctx, requestId, decision, comment) {
  if (!["approve", "reject"].includes(decision)) throw new ApprovalError("Choose approve or reject.");
  const row = pendingRequest(ctx, requestId);
  if (row.approver_id !== ctx.user.id && !isAdmin(ctx.user)) throw new ApprovalError("Only the approver can decide on this request.");
  const process = processFromRow(ctx.db.prepare("SELECT * FROM approval_processes WHERE id = ?").get(row.process_id));
  const status = decision === "approve" ? "approved" : "rejected";
  return tx(ctx.db, () => {
    ctx.db.prepare("UPDATE approval_requests SET status = ?, decided_at = ? WHERE id = ?").run(status, now(), requestId);
    addHistory(ctx.db, requestId, status, ctx.user.id, comment);
    const record = getRecord({ ...ctx, user: { ...ctx.user, profile: "admin" } }, row.object, row.record_id);
    const patch = Object.fromEntries((decision === "approve" ? process.approveActions : process.rejectActions)
      .map((a) => [a.field, cachedCompile(a.value)(record, { today: ctx.today })]));
    if (Object.keys(patch).length) updateRecord(ctx, row.object, row.record_id, patch, { system: true });
    notify(ctx.db, row.submitted_by, { type: "approval", title: `${record.name ?? ""} was ${status}`, body: comment || null,
      link: linkFor(row.object, row.record_id) });
    return requestFromRow(ctx.db.prepare("SELECT * FROM approval_requests WHERE id = ?").get(requestId));
  });
}

export function recall(ctx, requestId, comment) {
  const row = pendingRequest(ctx, requestId);
  if (row.submitted_by !== ctx.user.id && !isAdmin(ctx.user)) throw new ApprovalError("Only the submitter or an admin can recall this request.");
  ctx.db.prepare("UPDATE approval_requests SET status = 'recalled', decided_at = ? WHERE id = ?").run(now(), requestId);
  addHistory(ctx.db, requestId, "recalled", ctx.user.id, comment);
}

export function pendingFor(ctx) {
  const rows = ctx.db.prepare(`SELECT q.*, r.name AS record_name FROM approval_requests q JOIN records r ON r.id = q.record_id
    WHERE q.status = 'pending' AND q.approver_id = ? AND r.deleted_at IS NULL ORDER BY q.submitted_at`).all(ctx.user.id);
  const names = resolveNames(ctx.db, rows.map((r) => r.submitted_by));
  return rows.map((r) => ({ ...requestFromRow(r), recordName: r.record_name, submittedByName: names.get(r.submitted_by) ?? null }));
}

export function historyFor(ctx, object, recordId) {
  getRecord(ctx, object, recordId);
  const requests = ctx.db.prepare("SELECT * FROM approval_requests WHERE record_id = ? ORDER BY submitted_at DESC, rowid DESC").all(recordId);
  const steps = requests.length ? ctx.db.prepare(`SELECT * FROM approval_history WHERE request_id IN (${requests.map(() => "?").join(", ")}) ORDER BY id`)
    .all(...requests.map((r) => r.id)) : [];
  const names = resolveNames(ctx.db, [...requests.map((r) => r.approver_id), ...steps.map((s) => s.actor_id)]);
  return requests.map((r) => ({
    ...requestFromRow(r), approverName: names.get(r.approver_id) ?? null,
    steps: steps.filter((s) => s.request_id === r.id).map((s) => ({ action: s.action, actorId: s.actor_id,
      actorName: names.get(s.actor_id) ?? null, comment: s.comment, at: s.at })),
  }));
}

export function clearPending(ctx, recordId) {
  const row = pendingRow(ctx.db, recordId);
  if (!row) return;
  ctx.db.prepare("UPDATE approval_requests SET status = 'recalled', decided_at = ? WHERE id = ?").run(now(), row.id);
  addHistory(ctx.db, row.id, "recalled", ctx.user.id, "Record deleted");
}

export function assertUnlocked(ctx, recordId) {
  const row = pendingRow(ctx.db, recordId);
  if (!row || isAdmin(ctx.user) || row.approver_id === ctx.user.id) return;
  const lock = ctx.db.prepare("SELECT lock_record FROM approval_processes WHERE id = ?").get(row.process_id)?.lock_record;
  if (lock) throw new ForbiddenError("This record is locked while it waits for approval.");
}
