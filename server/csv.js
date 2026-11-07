import { tx } from "./db.js";
import { getObject } from "./metadata.js";
import { createRecord, listRecords, ValidationError } from "./records.js";

export class CsvError extends Error {}

export function parseCsv(text) {
  const src = String(text ?? "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

const FORMULA_START = /^[=+\-@]/;

export function toCsv(rows) {
  return rows.map((r) => r.map((v) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (FORMULA_START.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\r\n") + "\r\n";
}

function lookupByName(ctx, field, value, cache) {
  if (/^[0-9a-zA-Z]{15}$/.test(value)) return value;
  const target = String(field.referenceTo).split(",")[0];
  if (target === "*") return value;
  const key = `${target}:${value.toLowerCase()}`;
  if (!cache.has(key)) {
    const hit = ctx.db.prepare(`SELECT id FROM records WHERE object = ? AND deleted_at IS NULL AND lower(name) = lower(?) LIMIT 1`)
      .get(target, value);
    cache.set(key, hit?.id ?? value);
  }
  return cache.get(key);
}

export function importCsv(ctx, object, text) {
  const meta = getObject(ctx.db, object);
  const rows = parseCsv(text);
  if (!rows.length) throw new CsvError("The file is empty.");
  const [header, ...body] = rows;
  const writable = meta.fields.filter((f) => !f.system && !f.readonly);
  const mapping = header.map((h) => {
    const key = h.trim().toLowerCase();
    return writable.find((f) => f.name === key || f.label.toLowerCase() === key) ?? null;
  });
  if (!mapping.some(Boolean)) throw new CsvError("No columns match this object's fields.");
  const result = { created: 0, errors: [], skippedColumns: header.filter((_, i) => !mapping[i]) };
  const cache = new Map();
  tx(ctx.db, () => body.forEach((cells, i) => {
    const values = {};
    mapping.forEach((f, col) => {
      const v = (cells[col] ?? "").trim();
      if (!f || v === "") return;
      values[f.name] = f.type === "lookup" ? lookupByName(ctx, f, v, cache) : v;
    });
    try {
      createRecord(ctx, object, values);
      result.created++;
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      result.errors.push({ row: i + 2, errors: err.errors });
    }
  }));
  return result;
}

export function exportCsv(ctx, object, { columns, ...query } = {}) {
  const meta = getObject(ctx.db, object);
  const byName = new Map(meta.fields.map((f) => [f.name, f]));
  const cols = (columns?.length ? columns : meta.fields.filter((f) => !f.system).map((f) => f.name)).filter((c) => byName.has(c));
  const { records } = listRecords(ctx, object, { ...query, limit: null, offset: 0 });
  const value = (rec, f) => {
    if (f.type === "lookup") return rec.$names?.[f.name] ?? rec[f.name] ?? "";
    const v = rec[f.key ?? f.name];
    return Array.isArray(v) ? v.join(";") : v;
  };
  return toCsv([cols.map((c) => byName.get(c).label), ...records.map((r) => cols.map((c) => value(r, byName.get(c))))]);
}
