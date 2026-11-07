import { getObject, FILTER_OPS } from "./metadata.js";
import { visibilityClause } from "./sharing.js";
import { displayType, NUMERIC_TYPES } from "../shared/field-types.js";
import { ymd, addDays } from "../shared/dates.js";

export class QueryError extends Error {}

const monthRange = (y, m) => ({ from: ymd(new Date(y, m, 1)), to: ymd(new Date(y, m + 1, 0)) });

export function resolveDateLiteral(value, today = new Date()) {
  const v = String(value ?? "").trim().toUpperCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return { from: v, to: v };
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const y = t.getFullYear(), m = t.getMonth();
  const day = (n) => { const d = ymd(addDays(t, n)); return { from: d, to: d }; };
  const week = (n) => {
    const monday = addDays(t, -((t.getDay() + 6) % 7) + 7 * n);
    return { from: ymd(monday), to: ymd(addDays(monday, 6)) };
  };
  const quarter = (n) => {
    const q = Math.floor(m / 3) + n;
    return { from: ymd(new Date(y, q * 3, 1)), to: ymd(new Date(y, q * 3 + 3, 0)) };
  };
  const year = (n) => ({ from: `${y + n}-01-01`, to: `${y + n}-12-31` });
  const nDays = v.match(/^(LAST|NEXT)_N_DAYS:(\d+)$/);
  if (nDays) {
    const n = Number(nDays[2]);
    return nDays[1] === "LAST" ? { from: ymd(addDays(t, -n)), to: ymd(t) } : { from: ymd(t), to: ymd(addDays(t, n)) };
  }
  const table = {
    TODAY: () => day(0), YESTERDAY: () => day(-1), TOMORROW: () => day(1),
    THIS_WEEK: () => week(0), LAST_WEEK: () => week(-1), NEXT_WEEK: () => week(1),
    THIS_MONTH: () => monthRange(y, m), LAST_MONTH: () => monthRange(y, m - 1), NEXT_MONTH: () => monthRange(y, m + 1),
    THIS_QUARTER: () => quarter(0), LAST_QUARTER: () => quarter(-1), NEXT_QUARTER: () => quarter(1),
    THIS_YEAR: () => year(0), LAST_YEAR: () => year(-1), NEXT_YEAR: () => year(1),
  };
  return table[v]?.() ?? null;
}

export function fieldExpr(field, alias = "r") {
  if (field.system) return { sql: `${alias}.${field.column}`, params: [] };
  return { sql: `json_extract(${alias}.data, ?)`, params: [`$.${field.name}`] };
}

const escapeLike = (s) => String(s).toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`);

function compileFilter(field, { op, value }, today) {
  if (!FILTER_OPS.includes(op)) throw new QueryError(`Unknown filter operator ${op}`);
  const base = fieldExpr(field);
  const type = displayType(field);
  const numeric = NUMERIC_TYPES.has(type);
  const isDate = type === "date" || type === "datetime";
  const e = isDate && type === "datetime" ? `substr(${base.sql}, 1, 10)` : numeric ? `CAST(${base.sql} AS REAL)` : base.sql;
  const p = base.params;
  const out = (sql, params) => ({ sql, params });

  if (op === "blank") return out(`(${base.sql} IS NULL OR ${base.sql} = '')`, [...p, ...p]);
  if (op === "notblank") return out(`(${base.sql} IS NOT NULL AND ${base.sql} != '')`, [...p, ...p]);
  if (op === "in") {
    const list = Array.isArray(value) ? value : String(value ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!list.length) return out("0", []);
    return out(`lower(${e}) IN (${list.map(() => "lower(?)").join(", ")})`, [...p, ...list.map(String)]);
  }
  if (op === "contains") return out(`lower(${e}) LIKE '%' || ? || '%' ESCAPE '\\'`, [...p, escapeLike(value)]);
  if (op === "starts") return out(`lower(${e}) LIKE ? || '%' ESCAPE '\\'`, [...p, escapeLike(value)]);

  if (isDate) {
    const range = resolveDateLiteral(value, today);
    if (!range) throw new QueryError(`Unknown date value ${value}`);
    switch (op) {
      case "eq": return out(`(${e} >= ? AND ${e} <= ?)`, [...p, range.from, ...p, range.to]);
      case "ne": return out(`(${e} IS NULL OR ${e} < ? OR ${e} > ?)`, [...p, ...p, range.from, ...p, range.to]);
      case "lt": return out(`${e} < ?`, [...p, range.from]);
      case "lte": return out(`${e} <= ?`, [...p, range.to]);
      case "gt": return out(`${e} > ?`, [...p, range.to]);
      default: return out(`${e} >= ?`, [...p, range.from]);
    }
  }

  let v = value;
  if (type === "checkbox") v = value === true || value === "true" || value === 1 || value === "1" ? 1 : 0;
  else if (numeric) {
    v = Number(value);
    if (!Number.isFinite(v)) throw new QueryError(`${field.label} needs a number.`);
  }
  const cmp = (sqlOp) => (numeric || type === "checkbox" ? `${e} ${sqlOp} ?` : `lower(${e}) ${sqlOp} lower(?)`);
  switch (op) {
    case "eq": return type === "checkbox" && v === 0
      ? out(`coalesce(${e}, 0) = 0`, p) : out(cmp("="), [...p, v]);
    case "ne": return out(`(${base.sql} IS NULL OR ${cmp("!=")})`, [...p, ...p, v]);
    case "gt": return out(cmp(">"), [...p, v]);
    case "gte": return out(cmp(">="), [...p, v]);
    case "lt": return out(cmp("<"), [...p, v]);
    default: return out(cmp("<="), [...p, v]);
  }
}

export function buildQuery(db, user, {
  object, filters = [], scope = "all", search, sort, limit = 50, offset = 0, includeDeleted = false, ids, today,
}) {
  const meta = getObject(db, object);
  const byName = new Map(meta.fields.map((f) => [f.name, f]));
  const field = (name) => {
    const f = byName.get(name);
    if (!f) throw new QueryError(`Unknown field ${name} on ${object}`);
    return f;
  };
  const where = ["r.object = ?"];
  const params = [object];
  const add = ({ sql, params: p }) => { if (sql) { where.push(sql); params.push(...p); } };

  if (!includeDeleted) where.push("r.deleted_at IS NULL");
  add(visibilityClause(db, user, object));
  if (scope === "mine") add({ sql: "r.owner_id = ?", params: [user.id] });
  if (ids) add({ sql: `r.id IN (${ids.map(() => "?").join(", ") || "NULL"})`, params: ids });
  for (const flt of filters) add(compileFilter(field(flt.field), flt, today));
  if (search && String(search).trim()) {
    const term = escapeLike(String(search).trim());
    const searchable = meta.fields.filter((f) => f.searchable && !f.system);
    const parts = ["lower(r.name) LIKE '%' || ? || '%' ESCAPE '\\'"];
    const sp = [term];
    for (const f of searchable) {
      const fe = fieldExpr(f);
      parts.push(`lower(${fe.sql}) LIKE '%' || ? || '%' ESCAPE '\\'`);
      sp.push(...fe.params, term);
    }
    add({ sql: `(${parts.join(" OR ")})`, params: sp });
  }

  let orderSql = "r.updated_at DESC";
  const orderParams = [];
  if (sort?.field) {
    const dir = String(sort.dir ?? "asc").toLowerCase();
    if (!["asc", "desc"].includes(dir)) throw new QueryError(`Unknown sort direction ${sort.dir}`);
    const f = field(sort.field);
    const fe = fieldExpr(f);
    const expr = NUMERIC_TYPES.has(displayType(f)) ? `CAST(${fe.sql} AS REAL)` : fe.sql;
    orderSql = `${expr} IS NULL, ${expr} ${dir.toUpperCase()}, r.id`;
    orderParams.push(...fe.params, ...fe.params);
  }

  const whereSql = where.join(" AND ");
  return {
    sql: `SELECT r.* FROM records r WHERE ${whereSql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`,
    params: [...params, ...orderParams, limit === null ? -1 : Math.min(Number(limit) || 50, 2000), Number(offset) || 0],
    countSql: `SELECT count(*) AS n FROM records r WHERE ${whereSql}`,
    countParams: params,
  };
}
