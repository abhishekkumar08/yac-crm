import { tx, newId, now } from "./db.js";
import { compile } from "./expr.js";
import { getObject, objectForId, listAutomations, isAdmin, SYSTEM_FIELDS, CURRENCY_FIELD } from "./metadata.js";
import { getSettings, convert } from "./currency.js";
import { displayType } from "../shared/field-types.js";
import { canRead, canEdit } from "./sharing.js";
import { buildQuery } from "./query.js";
import { coerce, formatAutonumber, COMPUTED_TYPES } from "../shared/field-types.js";
import { OPPORTUNITY_STAGES } from "./standard-objects.js";
import { runAutomations } from "./automation.js";
import { afterRecordSave } from "./feed.js";
import { assertUnlocked, clearPending } from "./approvals.js";

export class ValidationError extends Error {
  constructor(errors) {
    super(Object.values(errors)[0] ?? "This record could not be saved.");
    this.errors = errors;
  }
}
export class ForbiddenError extends Error {}
export class NotFoundError extends Error {}

const SYSTEM_KEYS = new Set(["id", "object", "ownerId", "createdAt", "createdBy", "updatedAt", "updatedBy", "deletedAt"]);
const USER_FIELDS = Object.fromEntries(SYSTEM_FIELDS.filter((f) => f.type === "lookup").map((f) => [f.name, f.key]));
const CHUNK = 500;

const DERIVED_ROLLUPS = [
  { parent: "opportunity", field: "amount", rollup: { child: "opportunity_line_item", via: "opportunity", fn: "sum",
    field: "total_price", filter: null }, onlyWithChildren: true },
];

const blank = (v) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const asText = (v) => (v === undefined || v === null ? null : typeof v === "object" ? JSON.stringify(v) : String(v));

const compiled = new Map();
export function cachedCompile(src) {
  if (!compiled.has(src)) compiled.set(src, compile(src));
  return compiled.get(src);
}
function safeEval(src, record, ctx) {
  try {
    return cachedCompile(src)(record, ctx);
  } catch {
    return null;
  }
}

function toRecord(row) {
  return {
    ...JSON.parse(row.data), id: row.id, object: row.object, name: row.name, ownerId: row.owner_id,
    createdAt: row.created_at, createdBy: row.created_by, updatedAt: row.updated_at, updatedBy: row.updated_by,
    deletedAt: row.deleted_at,
  };
}

const liveRow = (db, id) => db.prepare("SELECT * FROM records WHERE id = ? AND deleted_at IS NULL").get(id);

export function liveRecord(db, id) {
  const row = liveRow(db, id);
  return row ? toRecord(row) : null;
}

function computeFormulas(meta, rec, today) {
  for (const f of meta.fields) {
    if (f.type === "formula") rec[f.name] = safeEval(f.formula, rec, { today }) ?? null;
  }
  return rec;
}

function inChunks(ids, fn) {
  const list = [...ids];
  for (let i = 0; i < list.length; i += CHUNK) fn(list.slice(i, i + CHUNK));
}

export function resolveNames(db, ids) {
  const names = new Map();
  const wanted = new Set([...ids].filter(Boolean).map(String));
  inChunks(wanted, (chunk) => {
    const marks = chunk.map(() => "?").join(", ");
    for (const r of db.prepare(`SELECT id, name FROM records WHERE id IN (${marks})`).all(...chunk)) names.set(r.id, r.name);
    for (const u of db.prepare(`SELECT id, name FROM users WHERE id IN (${marks})`).all(...chunk)) names.set(u.id, u.name);
  });
  return names;
}

export function decorate(db, meta, records, today) {
  const lookups = meta.fields.filter((f) => f.type === "lookup" && !f.system);
  const ids = new Set();
  for (const rec of records) {
    for (const f of meta.fields) if (!f.system && rec[f.name] === undefined) rec[f.name] = null;
    computeFormulas(meta, rec, today);
    for (const f of lookups) if (rec[f.name]) ids.add(rec[f.name]);
    for (const key of Object.values(USER_FIELDS)) if (rec[key]) ids.add(rec[key]);
  }
  const names = resolveNames(db, ids);
  for (const rec of records) {
    rec.$names = {};
    for (const f of lookups) if (rec[f.name]) rec.$names[f.name] = names.get(rec[f.name]) ?? null;
    for (const [field, key] of Object.entries(USER_FIELDS)) if (rec[key]) rec.$names[field] = names.get(rec[key]) ?? null;
  }
  return records;
}

function readDecorated(ctx, meta, id) {
  const row = ctx.db.prepare("SELECT * FROM records WHERE id = ?").get(id);
  return decorate(ctx.db, meta, [toRecord(row)], ctx.today)[0];
}

function lookupTargetOk(db, field, value) {
  const target = objectForId(db, value);
  const allowed = String(field.referenceTo).split(",");
  if (!target || !(allowed.includes("*") || allowed.includes(target))) return false;
  return Boolean(liveRow(db, value));
}

function displayName(db, meta, rec) {
  const byName = new Map(meta.fields.map((f) => [f.name, f]));
  for (const part of meta.nameField.split(",")) {
    const f = byName.get(part);
    const v = rec[part];
    if (blank(v)) continue;
    if (f?.type === "lookup") {
      const n = resolveNames(db, [v]).get(v);
      if (n) return n;
    } else {
      return String(v);
    }
  }
  return null;
}

const CURRENCY_PARENT = { opportunity_line_item: "opportunity", quote: "opportunity", quote_line_item: "quote" };

const CURRENCY_CHILDREN = { opportunity: ["opportunity_line_item", "opportunity"], quote: ["quote_line_item", "quote"] };

function applyCurrency(ctx, object, rec, before) {
  if (!getSettings(ctx.db).multiCurrency) return;
  const children = CURRENCY_CHILDREN[object];
  if (before && children && before[CURRENCY_FIELD] && rec[CURRENCY_FIELD] !== before[CURRENCY_FIELD]
    && ctx.db.prepare(`SELECT 1 FROM records WHERE object = ? AND deleted_at IS NULL AND json_extract(data, ?) = ? LIMIT 1`)
      .get(children[0], `$.${children[1]}`, before.id)) {
    throw new ValidationError({ [CURRENCY_FIELD]: "Remove the products before changing the currency." });
  }
  const parentField = CURRENCY_PARENT[object];
  const parent = parentField && rec[parentField] ? liveRow(ctx.db, rec[parentField]) : null;
  if (parent) rec[CURRENCY_FIELD] = JSON.parse(parent.data)[CURRENCY_FIELD] ?? rec[CURRENCY_FIELD];
  if (!before && !rec[CURRENCY_FIELD]) {
    const user = ctx.db.prepare("SELECT default_currency FROM users WHERE id = ?").get(ctx.user.id);
    rec[CURRENCY_FIELD] = user?.default_currency || getSettings(ctx.db).corporate;
  }
}

function applyObjectRules(object, rec, before, input) {
  if (object === "opportunity" && (!before || before.stage !== rec.stage)) {
    const stage = OPPORTUNITY_STAGES.find((s) => s.value === rec.stage);
    if (stage) {
      if (!("probability" in input)) rec.probability = stage.probability;
      if (!("forecast_category" in input)) rec.forecast_category = stage.forecast;
      rec.is_closed = Boolean(stage.closed);
      rec.is_won = Boolean(stage.won);
    }
  }
  if (object === "case") {
    if (!before) rec.is_closed_on_create = rec.status === "Closed";
    if (rec.status === "Closed" && !rec.closed_date) rec.closed_date = now();
    if (rec.status !== "Closed") rec.closed_date = null;
  }
}

function prepare(ctx, meta, before, input, { system = false } = {}) {
  const { db } = ctx;
  const errors = {};
  const isNew = !before;
  const fields = meta.fields.filter((f) => !f.system);
  const byName = new Map(fields.map((f) => [f.name, f]));
  const rec = isNew ? { object: meta.name } : { ...before };

  rec.ownerId = isNew ? ctx.user.id : before.ownerId;
  if (input.ownerId !== undefined && input.ownerId !== rec.ownerId) {
    const owner = db.prepare("SELECT id FROM users WHERE id = ? AND active = 1").get(input.ownerId ?? "");
    if (owner) rec.ownerId = owner.id;
    else errors.owner = "Choose an active user.";
  }

  for (const [key, raw] of Object.entries(input)) {
    if (key.startsWith("$") || SYSTEM_KEYS.has(key)) continue;
    const f = byName.get(key);
    if (!f) { errors._record = `Unknown field ${key}`; continue; }
    if (f.readonly && !system) {
      if (!isNew && same(before[key], raw)) continue;
      errors[key] = `${f.label} is read-only.`;
      continue;
    }
    const c = COMPUTED_TYPES.has(f.type) ? { value: raw } : coerce(f, raw);
    if (c.error) errors[key] = c.error;
    else rec[key] = c.value;
  }

  if (isNew) {
    for (const f of fields) {
      if (rec[f.name] !== undefined || COMPUTED_TYPES.has(f.type)) continue;
      if (f.defaultValue !== null && f.defaultValue !== undefined) {
        const c = coerce(f, f.defaultValue);
        if (!c.error) rec[f.name] = c.value;
      } else if (f.type === "checkbox") {
        rec[f.name] = false;
      }
    }
  }

  for (const f of fields) {
    const v = rec[f.name];
    if (f.type === "lookup" && !blank(v) && !errors[f.name] && (isNew || v !== before[f.name])) {
      if (!lookupTargetOk(db, f, v)) errors[f.name] = `Choose a valid ${f.label}.`;
    }
  }

  applyObjectRules(meta.name, rec, before, input);
  applyCurrency(ctx, meta.name, rec, before);

  for (const f of fields) {
    if (f.required && !f.readonly && blank(rec[f.name]) && !errors[f.name]) errors[f.name] = "Complete this field.";
    if (f.unique && !blank(rec[f.name]) && !errors[f.name]) {
      const dup = db.prepare(`SELECT 1 FROM records WHERE object = ? AND deleted_at IS NULL AND id != ?
        AND lower(json_extract(data, ?)) = lower(?)`).get(meta.name, rec.id ?? "", `$.${f.name}`, String(rec[f.name]));
      if (dup) errors[f.name] = "Another record already uses this value.";
    }
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);

  if (isNew) {
    for (const f of fields.filter((x) => x.type === "autonumber")) {
      const row = db.prepare("SELECT autonumber FROM fields WHERE object = ? AND name = ?").get(meta.name, f.name);
      const auto = JSON.parse(row.autonumber);
      rec[f.name] = formatAutonumber(auto.format, auto.next);
      db.prepare("UPDATE fields SET autonumber = ? WHERE object = ? AND name = ?")
        .run(JSON.stringify({ ...auto, next: auto.next + 1 }), meta.name, f.name);
    }
  }

  computeFormulas(meta, rec, ctx.today);
  rec.name = displayName(db, meta, rec);

  if (!system) {
    const rules = db.prepare("SELECT * FROM validation_rules WHERE object = ? AND active = 1").all(meta.name);
    for (const rule of rules) {
      if (safeEval(rule.condition, rec, { prior: before, isNew, today: ctx.today })) {
        errors[rule.field ?? "_record"] ??= rule.message;
      }
    }
    if (Object.keys(errors).length) throw new ValidationError(errors);
  }

  const data = {};
  for (const f of fields) if (rec[f.name] !== undefined) data[f.name] = rec[f.name];
  if (rec[CURRENCY_FIELD] !== undefined && data[CURRENCY_FIELD] === undefined) data[CURRENCY_FIELD] = rec[CURRENCY_FIELD];
  return { rec, data };
}

function writeHistory(ctx, meta, before, rec) {
  const insert = ctx.db.prepare(`INSERT INTO field_history (record_id, object, field, old_value, new_value, user_id, at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const at = now();
  if (!before) {
    insert.run(rec.id, meta.name, "created", null, null, ctx.user.id, at);
    return;
  }
  if (before.ownerId !== rec.ownerId) insert.run(rec.id, meta.name, "owner", before.ownerId, rec.ownerId, ctx.user.id, at);
  for (const f of meta.fields) {
    if (f.system || f.type === "formula" || f.type === "rollup") continue;
    if (!same(before[f.name], rec[f.name])) {
      insert.run(rec.id, meta.name, f.name, asText(before[f.name]), asText(rec[f.name]), ctx.user.id, at);
    }
  }
}

function rollupsForChild(db, child) {
  const rows = db.prepare(`SELECT object, name, rollup FROM fields WHERE type = 'rollup'
    AND json_extract(rollup, '$.child') = ?`).all(child);
  return [
    ...rows.map((r) => ({ parent: r.object, field: r.name, rollup: JSON.parse(r.rollup) })),
    ...DERIVED_ROLLUPS.filter((d) => d.rollup.child === child),
  ];
}

function aggregate(ctx, { rollup, onlyWithChildren }, parent) {
  const rows = ctx.db.prepare(`SELECT * FROM records WHERE object = ? AND deleted_at IS NULL
    AND json_extract(data, ?) = ?`).all(rollup.child, `$.${rollup.via}`, parent.id);
  const children = rows.map(toRecord).filter((c) => !rollup.filter || safeEval(rollup.filter, c, { today: ctx.today }));
  if (onlyWithChildren && rows.length === 0) return undefined;
  if (rollup.fn === "count") return children.length;
  const childField = getObject(ctx.db, rollup.child).fields.find((f) => f.name === rollup.field);
  const money = childField && displayType(childField) === "currency";
  const values = children.map((c) => (money ? convert(ctx.db, c[rollup.field], c[CURRENCY_FIELD], parent[CURRENCY_FIELD]) : c[rollup.field]))
    .filter((v) => v !== null && v !== undefined);
  if (rollup.fn === "sum") return values.reduce((s, v) => s + Number(v), 0);
  if (!values.length) return null;
  if (rollup.fn === "avg") return values.reduce((s, v) => s + Number(v), 0) / values.length;
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return rollup.fn === "min" ? sorted[0] : sorted[sorted.length - 1];
}

function refreshParents(ctx, child, before, after) {
  for (const def of rollupsForChild(ctx.db, child)) {
    const parentIds = new Set([before?.[def.rollup.via], after?.[def.rollup.via]].filter(Boolean));
    for (const parentId of parentIds) {
      const parentRow = liveRow(ctx.db, parentId);
      if (!parentRow || parentRow.object !== def.parent) continue;
      const parent = toRecord(parentRow);
      const value = aggregate(ctx, def, parent);
      if (value === undefined || same(parent[def.field], value)) continue;
      updateRecord(ctx, def.parent, parentId, { [def.field]: value }, { system: true, skipAutomation: true, skipFeed: true });
    }
  }
}

function afterSave(ctx, meta, before, rec, opts) {
  writeHistory(ctx, meta, before, rec);
  if (!opts.skipFeed) afterRecordSave(ctx, meta, before, rec);
  refreshParents(ctx, meta.name, before, rec);
  if (!opts.skipAutomation && listAutomations(ctx.db, meta.name).some((r) => r.active)) {
    runAutomations(ctx, meta.name, before, readDecorated(ctx, meta, rec.id));
  }
}

export function createRecord(ctx, object, values = {}, opts = {}) {
  const meta = getObject(ctx.db, object);
  return tx(ctx.db, () => {
    const { rec, data } = prepare(ctx, meta, null, values, opts);
    rec.id = newId(meta.prefix);
    const at = now();
    ctx.db.prepare(`INSERT INTO records (id, object, name, owner_id, data, created_at, created_by, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(rec.id, object, rec.name, rec.ownerId, JSON.stringify(data), at,
      ctx.user.id, at, ctx.user.id);
    afterSave(ctx, meta, null, rec, opts);
    return readDecorated(ctx, meta, rec.id);
  });
}

export function updateRecord(ctx, object, id, patch = {}, opts = {}) {
  const meta = getObject(ctx.db, object);
  return tx(ctx.db, () => {
    const row = liveRow(ctx.db, id);
    if (!row || row.object !== object) throw new NotFoundError("Record not found.");
    const before = toRecord(row);
    if (!opts.system && !canEdit(ctx.db, ctx.user, before)) throw new ForbiddenError("You can't edit this record.");
    if (!opts.system) assertUnlocked(ctx, id);
    const { rec, data } = prepare(ctx, meta, before, patch, opts);
    const changed = rec.ownerId !== before.ownerId || rec.name !== before.name
      || meta.fields.some((f) => !f.system && !same(before[f.name], rec[f.name]));
    if (!changed) return readDecorated(ctx, meta, id);
    ctx.db.prepare("UPDATE records SET name = ?, owner_id = ?, data = ?, updated_at = ?, updated_by = ? WHERE id = ?")
      .run(rec.name, rec.ownerId, JSON.stringify(data), now(), ctx.user.id, id);
    afterSave(ctx, meta, before, rec, opts);
    return readDecorated(ctx, meta, id);
  });
}

export function getRecord(ctx, object, id) {
  const meta = getObject(ctx.db, object);
  const row = liveRow(ctx.db, id);
  if (!row || row.object !== object) throw new NotFoundError("Record not found.");
  const rec = toRecord(row);
  if (!canRead(ctx.db, ctx.user, rec)) throw new ForbiddenError("You don't have access to this record.");
  return decorate(ctx.db, meta, [rec], ctx.today)[0];
}

export function listRecords(ctx, object, opts = {}) {
  const meta = getObject(ctx.db, object);
  const q = buildQuery(ctx.db, ctx.user, { object, today: ctx.today, ...opts });
  const records = ctx.db.prepare(q.sql).all(...q.params).map(toRecord);
  const total = ctx.db.prepare(q.countSql).get(...q.countParams).n;
  return { records: decorate(ctx.db, meta, records, ctx.today), total };
}

function cascadeTargets(db, object) {
  return db.prepare("SELECT object, name, reference_to FROM fields WHERE type = 'lookup' AND cascade = 1").all()
    .filter((f) => f.reference_to.split(",").includes(object));
}

function softDelete(ctx, row, at, parentId, removed) {
  ctx.db.prepare("UPDATE records SET deleted_at = ?, deleted_by = ?, deleted_parent = ? WHERE id = ?")
    .run(at, ctx.user.id, parentId, row.id);
  removed.push(toRecord(row));
  clearPending(ctx, row.id);
  for (const t of cascadeTargets(ctx.db, row.object)) {
    const kids = ctx.db.prepare(`SELECT * FROM records WHERE object = ? AND deleted_at IS NULL AND json_extract(data, ?) = ?`)
      .all(t.object, `$.${t.name}`, row.id);
    for (const kid of kids) {
      assertUnlocked(ctx, kid.id);
      softDelete(ctx, kid, at, row.id, removed);
    }
  }
}

export function deleteRecord(ctx, object, id) {
  tx(ctx.db, () => {
    const row = liveRow(ctx.db, id);
    if (!row || row.object !== object) throw new NotFoundError("Record not found.");
    if (!canEdit(ctx.db, ctx.user, toRecord(row))) throw new ForbiddenError("You can't delete this record.");
    assertUnlocked(ctx, id);
    const removed = [];
    softDelete(ctx, row, now(), null, removed);
    for (const rec of removed) refreshParents(ctx, rec.object, rec, null);
  });
}

function undelete(ctx, row, restored) {
  ctx.db.prepare("UPDATE records SET deleted_at = NULL, deleted_by = NULL, deleted_parent = NULL WHERE id = ?").run(row.id);
  restored.push(toRecord({ ...row, deleted_at: null }));
  for (const kid of ctx.db.prepare("SELECT * FROM records WHERE deleted_parent = ?").all(row.id)) undelete(ctx, kid, restored);
}

export function restoreRecord(ctx, id) {
  return tx(ctx.db, () => {
    const row = ctx.db.prepare("SELECT * FROM records WHERE id = ? AND deleted_at IS NOT NULL AND deleted_parent IS NULL").get(id);
    if (!row) throw new NotFoundError("That record isn't in the recycle bin.");
    if (!canEdit(ctx.db, ctx.user, toRecord(row))) throw new ForbiddenError("You can't restore this record.");
    const restored = [];
    undelete(ctx, row, restored);
    for (const rec of restored) refreshParents(ctx, rec.object, null, rec);
    return getRecord(ctx, row.object, id);
  });
}

export function recycleBin(ctx) {
  const admin = isAdmin(ctx.user);
  const rows = ctx.db.prepare(`SELECT r.id, r.object, r.name, r.deleted_at, r.deleted_by, u.name AS deleted_by_name,
      o.label AS object_label
    FROM records r LEFT JOIN users u ON u.id = r.deleted_by JOIN objects o ON o.name = r.object
    WHERE r.deleted_at IS NOT NULL AND r.deleted_parent IS NULL ${admin ? "" : "AND r.deleted_by = ?"}
    ORDER BY r.deleted_at DESC LIMIT 500`).all(...(admin ? [] : [ctx.user.id]));
  return rows.map((r) => ({ id: r.id, object: r.object, objectLabel: r.object_label, name: r.name,
    deletedAt: r.deleted_at, deletedBy: r.deleted_by, deletedByName: r.deleted_by_name }));
}

export function relatedLists(ctx, object, id) {
  const meta = getObject(ctx.db, object);
  getRecord(ctx, object, id);
  return meta.layout.related.map((r) => {
    const page = listRecords(ctx, r.object, { filters: [{ field: r.field, op: "eq", value: id }], limit: 6,
      sort: { field: "updated_at", dir: "desc" } });
    return { ...r, label: r.label ?? getObject(ctx.db, r.object).plural, ...page };
  });
}

const ACTIVITY_LINKS = { task: ["what", "who"], event: ["what", "who"], note: ["what"] };

export function timeline(ctx, id) {
  const linked = ctx.db.prepare(`SELECT id, object FROM records WHERE deleted_at IS NULL
    AND object IN (${Object.keys(ACTIVITY_LINKS).map(() => "?").join(", ")})
    AND (json_extract(data, '$.what') = ? OR json_extract(data, '$.who') = ?)`).all(...Object.keys(ACTIVITY_LINKS), id, id);
  const seen = new Map();
  for (const object of Object.keys(ACTIVITY_LINKS)) {
    const ids = linked.filter((r) => r.object === object).map((r) => r.id);
    if (!ids.length) continue;
    for (const rec of listRecords(ctx, object, { ids, limit: null }).records) seen.set(rec.id, rec);
  }
  const when = (r) => (r.object === "event" ? r.start : r.object === "task" ? r.due_date ?? r.createdAt : r.createdAt) ?? "";
  return [...seen.values()].sort((a, b) => (when(b) > when(a) ? 1 : when(b) < when(a) ? -1 : 0));
}

export function fieldHistory(ctx, id) {
  const row = ctx.db.prepare("SELECT * FROM records WHERE id = ?").get(id);
  if (!row) throw new NotFoundError("Record not found.");
  if (!canRead(ctx.db, ctx.user, toRecord(row))) throw new ForbiddenError("You don't have access to this record.");
  const meta = getObject(ctx.db, row.object);
  const byName = new Map(meta.fields.map((f) => [f.name, f]));
  const rows = ctx.db.prepare(`SELECT h.*, u.name AS user_name FROM field_history h LEFT JOIN users u ON u.id = h.user_id
    WHERE h.record_id = ? ORDER BY h.id DESC`).all(id);
  const lookupIds = rows.filter((h) => byName.get(h.field)?.type === "lookup").flatMap((h) => [h.old_value, h.new_value]);
  const names = resolveNames(ctx.db, lookupIds);
  return rows.map((h) => ({
    id: h.id, field: h.field, fieldLabel: h.field === "created" ? "Created" : byName.get(h.field)?.label ?? h.field,
    oldValue: h.old_value, newValue: h.new_value, oldName: names.get(h.old_value) ?? null,
    newName: names.get(h.new_value) ?? null, userId: h.user_id, userName: h.user_name, at: h.at,
  }));
}
