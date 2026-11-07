import { newId, now } from "./db.js";
import { getObject, listObjects, canManage, CURRENCY_FIELD } from "./metadata.js";
import { getSettings, toCorporate } from "./currency.js";
import { listRecords } from "./records.js";
import { displayType, NUMERIC_TYPES, aggKey } from "../shared/field-types.js";

export class ReportError extends Error {}

const FNS = ["count", "sum", "avg", "min", "max"];
// ponytail: reports aggregate in JS over at most MAX_ROWS records; push grouping into SQL if datasets outgrow it.
const MAX_ROWS = 2000;
const SEARCH_SKIP = new Set(["opportunity_line_item", "quote_line_item", "pricebook_entry", "campaign_member"]);
const BLANK = "(blank)";

function validate(db, def) {
  const meta = getObject(db, def.object);
  const byName = new Map(meta.fields.map((f) => [f.name, f]));
  const need = (name) => {
    const f = byName.get(name);
    if (!f) throw new ReportError(`Unknown field ${name} on ${def.object}`);
    return f;
  };
  const groupBy = def.groupBy ?? [];
  if (groupBy.length > 2) throw new ReportError("Group by at most two fields.");
  groupBy.forEach(need);
  (def.columns ?? []).forEach(need);
  for (const a of def.aggregates ?? []) {
    if (!FNS.includes(a.fn)) throw new ReportError(`Unknown summary ${a.fn}`);
    if (a.fn === "count") continue;
    if (!NUMERIC_TYPES.has(displayType(need(a.field)))) throw new ReportError(`${a.fn} needs a number field.`);
  }
  return { meta, byName };
}

function summarize(records, aggregates) {
  const values = { count: records.length };
  for (const a of aggregates) {
    if (a.fn === "count") continue;
    const nums = records.map((r) => r[a.field]).filter((v) => v !== null && v !== undefined).map(Number);
    const key = aggKey(a);
    if (a.fn === "sum") values[key] = nums.reduce((s, v) => s + v, 0);
    else if (!nums.length) values[key] = null;
    else if (a.fn === "avg") values[key] = nums.reduce((s, v) => s + v, 0) / nums.length;
    else values[key] = a.fn === "min" ? Math.min(...nums) : Math.max(...nums);
  }
  return values;
}

function groupKey(field, rec) {
  const raw = rec[field.key ?? field.name];
  if (raw === null || raw === undefined || raw === "") return { key: "", label: BLANK };
  const type = displayType(field);
  if (type === "lookup") return { key: raw, label: rec.$names?.[field.name] ?? raw };
  if (type === "date" || type === "datetime") return { key: String(raw).slice(0, 7), label: String(raw).slice(0, 7) };
  if (type === "checkbox") return { key: String(Boolean(raw)), label: raw ? "True" : "False" };
  if (Array.isArray(raw)) return { key: raw.join(";"), label: raw.join("; ") };
  return { key: String(raw), label: String(raw) };
}

function groupOrder(field) {
  const type = displayType(field);
  return (a, b) => {
    if (a.key === "" || b.key === "") return a.key === "" ? 1 : -1;
    if (field.picklist) return field.picklist.indexOf(a.key) - field.picklist.indexOf(b.key);
    if (NUMERIC_TYPES.has(type)) return Number(a.key) - Number(b.key);
    if (type === "date" || type === "datetime") return a.key < b.key ? -1 : 1;
    return a.label.localeCompare(b.label);
  };
}

function group(records, fields, aggregates) {
  if (!fields.length) return undefined;
  const [field, ...rest] = fields;
  const buckets = new Map();
  for (const rec of records) {
    const { key, label } = groupKey(field, rec);
    if (!buckets.has(key)) buckets.set(key, { key, label, records: [] });
    buckets.get(key).records.push(rec);
  }
  return [...buckets.values()].sort(groupOrder(field)).map((b) => ({
    key: b.key, label: b.label, values: summarize(b.records, aggregates), subgroups: group(b.records, rest, aggregates),
  }));
}

export function runReport(ctx, def) {
  const { byName } = validate(ctx.db, def);
  const aggregates = def.aggregates ?? [];
  const { records, total } = listRecords(ctx, def.object, {
    filters: def.filters ?? [], scope: def.scope ?? "all", sort: def.sort, limit: MAX_ROWS,
  });
  const money = getSettings(ctx.db).multiCurrency
    ? [...byName.values()].filter((f) => displayType(f) === "currency").map((f) => f.name) : [];
  const calc = money.length
    ? records.map((r) => ({ ...r, ...Object.fromEntries(money.map((m) => [m, toCorporate(ctx.db, r[m], r[CURRENCY_FIELD])])) }))
    : records;
  return {
    columns: def.columns ?? [], rows: records, truncated: total > records.length, total,
    groups: group(calc, (def.groupBy ?? []).map((n) => byName.get(n)), aggregates) ?? [],
    totals: summarize(calc, aggregates),
  };
}

export function forecast(ctx, { year }) {
  const { records } = listRecords(ctx, "opportunity", {
    filters: [{ field: "close_date", op: "gte", value: `${year}-01-01` }, { field: "close_date", op: "lte", value: `${year}-12-31` }],
    limit: null,
  });
  const rows = new Map();
  for (const o of records) {
    const quarter = Math.floor((Number(o.close_date.slice(5, 7)) - 1) / 3) + 1;
    const key = `${quarter}:${o.ownerId}`;
    if (!rows.has(key)) rows.set(key, { quarter, ownerId: o.ownerId, ownerName: o.$names.owner, closed: 0, commit: 0, bestCase: 0, pipeline: 0 });
    const row = rows.get(key);
    const amount = Number(toCorporate(ctx.db, o.amount ?? 0, o[CURRENCY_FIELD]) ?? 0);
    if (o.is_won) row.closed += amount;
    else if (!o.is_closed) {
      row.pipeline += amount;
      if (["Commit", "Best Case"].includes(o.forecast_category)) row.bestCase += amount;
      if (o.forecast_category === "Commit") row.commit += amount;
    }
  }
  return [...rows.values()].sort((a, b) => a.quarter - b.quarter || a.ownerName.localeCompare(b.ownerName));
}

const reportFromRow = (r) => r && ({ id: r.id, name: r.name, description: r.description, ownerId: r.owner_id,
  ownerName: r.owner_name, def: JSON.parse(r.def), createdAt: r.created_at, updatedAt: r.updated_at });

export function listReports(ctx) {
  return ctx.db.prepare(`SELECT r.*, u.name AS owner_name FROM reports r LEFT JOIN users u ON u.id = r.owner_id
    ORDER BY r.updated_at DESC`).all().map(reportFromRow);
}

export function getReport(ctx, id) {
  return reportFromRow(ctx.db.prepare(`SELECT r.*, u.name AS owner_name FROM reports r LEFT JOIN users u ON u.id = r.owner_id
    WHERE r.id = ?`).get(id)) ?? null;
}

export function saveReport(ctx, { id, name, description, def }) {
  if (!name?.trim()) throw new ReportError("Enter a report name.");
  validate(ctx.db, def);
  const at = now();
  if (id) {
    const existing = getReport(ctx, id);
    if (!existing) throw new ReportError("Report not found.");
    if (!canManage(ctx.user, existing.ownerId)) throw new ReportError("You are not allowed to change this report.");
    ctx.db.prepare("UPDATE reports SET name = ?, description = ?, def = ?, updated_at = ? WHERE id = ?")
      .run(name.trim(), description ?? null, JSON.stringify(def), at, id);
    return getReport(ctx, id);
  }
  const newIdValue = newId("00O");
  ctx.db.prepare("INSERT INTO reports (id, name, description, owner_id, def, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(newIdValue, name.trim(), description ?? null, ctx.user.id, JSON.stringify(def), at, at);
  return getReport(ctx, newIdValue);
}

export function deleteReport(ctx, id) {
  const existing = getReport(ctx, id);
  if (!existing) throw new ReportError("Report not found.");
  if (!canManage(ctx.user, existing.ownerId)) throw new ReportError("You are not allowed to delete this report.");
  ctx.db.prepare("DELETE FROM reports WHERE id = ?").run(id);
}

const dashFromRow = (r) => r && ({ id: r.id, name: r.name, description: r.description, ownerId: r.owner_id,
  ownerName: r.owner_name, components: JSON.parse(r.components), updatedAt: r.updated_at });

export function listDashboards(ctx) {
  return ctx.db.prepare(`SELECT d.*, u.name AS owner_name FROM dashboards d LEFT JOIN users u ON u.id = d.owner_id
    ORDER BY d.updated_at DESC`).all().map(dashFromRow);
}

export function getDashboard(ctx, id) {
  return dashFromRow(ctx.db.prepare(`SELECT d.*, u.name AS owner_name FROM dashboards d LEFT JOIN users u ON u.id = d.owner_id
    WHERE d.id = ?`).get(id)) ?? null;
}

const COMPONENT_TYPES = ["metric", "bar", "column", "pie", "donut", "line", "table"];

export function saveDashboard(ctx, { id, name, description, components = [] }) {
  if (!name?.trim()) throw new ReportError("Enter a dashboard name.");
  for (const c of components) {
    if (!COMPONENT_TYPES.includes(c.type)) throw new ReportError(`Unknown component type ${c.type}`);
    if (!getReport(ctx, c.reportId)) throw new ReportError("Choose a saved report for every component.");
  }
  const at = now();
  const json = JSON.stringify(components);
  if (id) {
    const existing = getDashboard(ctx, id);
    if (!existing) throw new ReportError("Dashboard not found.");
    if (!canManage(ctx.user, existing.ownerId)) throw new ReportError("You are not allowed to change this dashboard.");
    ctx.db.prepare("UPDATE dashboards SET name = ?, description = ?, components = ?, updated_at = ? WHERE id = ?")
      .run(name.trim(), description ?? null, json, at, id);
    return getDashboard(ctx, id);
  }
  const dashId = newId("01Z");
  ctx.db.prepare("INSERT INTO dashboards (id, name, description, owner_id, components, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(dashId, name.trim(), description ?? null, ctx.user.id, json, at, at);
  return getDashboard(ctx, dashId);
}

export function deleteDashboard(ctx, id) {
  const existing = getDashboard(ctx, id);
  if (!existing) throw new ReportError("Dashboard not found.");
  if (!canManage(ctx.user, existing.ownerId)) throw new ReportError("You are not allowed to delete this dashboard.");
  ctx.db.prepare("DELETE FROM dashboards WHERE id = ?").run(id);
}

export function runDashboard(ctx, id) {
  const dash = getDashboard(ctx, id);
  if (!dash) throw new ReportError("Dashboard not found.");
  return {
    ...dash,
    components: dash.components.map((c) => {
      const report = getReport(ctx, c.reportId);
      if (!report) return { ...c, error: "This report was deleted." };
      try {
        return { ...c, report: { id: report.id, name: report.name, def: report.def }, result: runReport(ctx, report.def) };
      } catch (err) {
        return { ...c, error: err.message };
      }
    }),
  };
}

export function globalSearch(ctx, q, { limit = 5 } = {}) {
  if (!String(q ?? "").trim()) return [];
  return listObjects(ctx.db)
    .filter((o) => !SEARCH_SKIP.has(o.name))
    .map((o) => ({ object: o.name, label: o.label, plural: o.plural, icon: o.icon,
      ...listRecords(ctx, o.name, { search: q, limit }) }))
    .filter((g) => g.total > 0);
}
