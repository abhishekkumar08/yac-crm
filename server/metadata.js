import { tx, newId } from "./db.js";
import { check } from "./expr.js";
import { FIELD_TYPES, COMPUTED_TYPES, NUMERIC_TYPES } from "../shared/field-types.js";
import { STANDARD_OBJECTS, APPS } from "./standard-objects.js";
import { getSettings, activeCodes } from "./currency.js";

export { APPS };

export class MetadataError extends Error {}

export const SYSTEM_FIELDS = [
  { name: "owner", label: "Owner", type: "lookup", referenceTo: "user", column: "owner_id", key: "ownerId" },
  { name: "created_by", label: "Created By", type: "lookup", referenceTo: "user", column: "created_by", key: "createdBy" },
  { name: "created_at", label: "Created Date", type: "datetime", column: "created_at", key: "createdAt" },
  { name: "updated_by", label: "Last Modified By", type: "lookup", referenceTo: "user", column: "updated_by", key: "updatedBy" },
  { name: "updated_at", label: "Last Modified Date", type: "datetime", column: "updated_at", key: "updatedAt" },
].map((f) => ({ ...f, system: true, readonly: true, required: false, custom: false }));

const RESERVED = new Set(["id", "object", "data", "owner_id", "deleted_at", "deleted_by", "record_type",
  ...SYSTEM_FIELDS.map((f) => f.name)]);
export const FILTER_OPS = ["eq", "ne", "contains", "starts", "gt", "gte", "lt", "lte", "in", "blank", "notblank"];
const SHARING = ["public_rw", "public_ro", "private"];
const ROLLUP_FNS = ["count", "sum", "min", "max", "avg"];
const TRIGGERS = ["create", "update", "create_or_update"];

const json = (v) => (v === undefined || v === null ? null : JSON.stringify(v));
const parse = (v, fallback = null) => (v === null || v === undefined ? fallback : JSON.parse(v));
const bool = (v) => Boolean(v);
const slug = (label) => {
  const s = String(label ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!s) throw new MetadataError("Enter a label.");
  return /^[0-9]/.test(s) ? `x_${s}` : s;
};

function fieldFromRow(r) {
  return {
    object: r.object, name: r.name, label: r.label, type: r.type, required: bool(r.required),
    unique: bool(r.is_unique), picklist: parse(r.picklist), referenceTo: r.reference_to, cascade: bool(r.cascade),
    formula: r.formula, rollup: parse(r.rollup), autonumber: parse(r.autonumber), defaultValue: r.default_value,
    searchable: bool(r.searchable), custom: bool(r.custom), readonly: bool(r.readonly) || COMPUTED_TYPES.has(r.type),
    returnType: r.return_type, help: r.help, sort: r.sort,
  };
}

function objectFromRow(r) {
  return {
    name: r.name, label: r.label, plural: r.plural, prefix: r.prefix, custom: bool(r.custom),
    nameField: r.name_field, sharing: r.sharing, pathField: r.path_field, icon: r.icon, description: r.description,
  };
}

function insertField(db, object, def, sort) {
  db.prepare(`INSERT INTO fields (object, name, label, type, required, is_unique, picklist, reference_to, cascade,
      formula, rollup, autonumber, default_value, searchable, custom, readonly, return_type, help, sort)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    object, def.name, def.label, def.type, def.required ? 1 : 0, def.unique ? 1 : 0, json(def.picklist),
    def.referenceTo ?? null, def.cascade ? 1 : 0, def.formula ?? null, json(def.rollup), json(def.autonumber),
    def.defaultValue ?? null, def.searchable ? 1 : 0, def.custom ? 1 : 0, def.readonly ? 1 : 0,
    def.returnType ?? null, def.help ?? null, sort);
}

function insertView(db, object, view, ownerId = null) {
  const id = newId("00B");
  db.prepare(`INSERT INTO list_views (id, object, name, owner_id, shared, scope, filters, columns, sort, kanban_field)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, object, view.name, ownerId, view.shared === false ? 0 : 1,
    view.scope ?? "all", json(view.filters ?? []), json(view.columns ?? []), json(view.sort ?? null),
    view.kanbanField ?? null);
  return id;
}

function insertRule(db, object, rule) {
  const id = newId("03d");
  db.prepare(`INSERT INTO validation_rules (id, object, name, condition, message, field, active)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, object, rule.name, rule.condition, rule.message, rule.field ?? null,
    rule.active === false ? 0 : 1);
  return id;
}

function insertStandardObject(db, o, sort) {
  db.prepare(`INSERT INTO objects (name, label, plural, prefix, custom, name_field, path_field, icon, sort)
    VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)`).run(o.name, o.label, o.plural, o.prefix, o.nameField ?? "name",
    o.pathField ?? null, o.icon ?? null, sort);
  o.fields.forEach((fd, j) => insertField(db, o.name, fd, j));
  db.prepare("INSERT INTO layouts (object, sections, related, highlights) VALUES (?, ?, ?, ?)")
    .run(o.name, json(o.layout.sections), json(o.layout.related), json(o.layout.highlights));
  for (const v of o.views) insertView(db, o.name, v);
  for (const r of o.rules ?? []) insertRule(db, o.name, r);
}

function addMissingField(db, o, fd) {
  const sort = db.prepare("SELECT coalesce(max(sort), 0) + 1 AS n FROM fields WHERE object = ?").get(o.name).n;
  insertField(db, o.name, fd, sort);
  const layout = db.prepare("SELECT sections FROM layouts WHERE object = ?").get(o.name);
  const sections = parse(layout?.sections, []);
  if (sections.some((sec) => sec.fields.includes(fd.name))) return;
  const home = o.layout.sections.find((sec) => sec.fields.includes(fd.name))?.label;
  const target = sections.find((sec) => sec.label === home) ?? sections[0];
  if (!target) return;
  target.fields.push(fd.name);
  db.prepare("UPDATE layouts SET sections = ? WHERE object = ?").run(json(sections), o.name);
}

export function syncStandardMetadata(db) {
  tx(db, () => {
    const added = new Set();
    STANDARD_OBJECTS.forEach((o, i) => {
      if (!objectExists(db, o.name)) {
        insertStandardObject(db, o, i);
        added.add(o.name);
        return;
      }
      const have = new Set(getFields(db, o.name).map((f) => f.name));
      for (const fd of o.fields) if (!have.has(fd.name)) addMissingField(db, o, fd);
    });
    if (!added.size) return;
    for (const o of STANDARD_OBJECTS) {
      if (added.has(o.name)) continue;
      const wanted = o.layout.related.filter((r) => added.has(r.object));
      if (!wanted.length) continue;
      const related = parse(db.prepare("SELECT related FROM layouts WHERE object = ?").get(o.name)?.related, []);
      db.prepare("UPDATE layouts SET related = ? WHERE object = ?").run(json([...related, ...wanted]), o.name);
    }
  });
}

export const seedMetadata = syncStandardMetadata;

export function listObjects(db) {
  return db.prepare("SELECT * FROM objects ORDER BY custom, sort, label").all().map(objectFromRow);
}

export function objectExists(db, name) {
  return Boolean(db.prepare("SELECT 1 FROM objects WHERE name = ?").get(name));
}

export function getFields(db, object) {
  return db.prepare("SELECT * FROM fields WHERE object = ? ORDER BY sort").all(object).map(fieldFromRow);
}

export function getObject(db, name) {
  const row = db.prepare("SELECT * FROM objects WHERE name = ?").get(name);
  if (!row) throw new MetadataError(`Unknown object ${name}`);
  const layout = db.prepare("SELECT * FROM layouts WHERE object = ?").get(name);
  const sections = parse(layout?.sections, []);
  const currencyField = getSettings(db).multiCurrency ? [currencyFieldFor(db, name)] : [];
  if (currencyField.length && sections.length && !sections.some((s) => s.fields.includes(CURRENCY_FIELD))) {
    sections[0] = { ...sections[0], fields: [...sections[0].fields, CURRENCY_FIELD] };
  }
  return {
    ...objectFromRow(row),
    fields: [...getFields(db, name), ...currencyField, ...SYSTEM_FIELDS.map((f) => ({ ...f, object: name }))],
    layout: { sections, related: parse(layout?.related, []), highlights: parse(layout?.highlights, []) },
  };
}

export const CURRENCY_FIELD = "currency_iso_code";

function currencyFieldFor(db, object) {
  return { object, name: CURRENCY_FIELD, label: "Record Currency", type: "picklist", picklist: activeCodes(db),
    required: false, unique: false, readonly: false, custom: false, searchable: false, referenceTo: null, sort: 9999 };
}

export function objectForId(db, id) {
  const prefix = String(id ?? "").slice(0, 3);
  const row = db.prepare("SELECT name FROM objects WHERE prefix = ?").get(prefix);
  return row?.name ?? null;
}

const fieldNamesOf = (db, object) => getObject(db, object).fields.map((f) => f.name);

function requireField(db, object, name) {
  if (!fieldNamesOf(db, object).includes(name)) throw new MetadataError(`Unknown field ${name} on ${object}`);
}

function checkExpr(db, object, src) {
  const result = check(src, fieldNamesOf(db, object));
  if (!result.ok) throw new MetadataError(result.error);
}

function nextPrefix(db) {
  const used = new Set(db.prepare("SELECT prefix FROM objects").all().map((r) => r.prefix));
  for (let n = 0; n < 36 * 36; n++) {
    const p = `a${n.toString(36).padStart(2, "0")}`;
    if (!used.has(p)) return p;
  }
  throw new MetadataError("No object prefixes left.");
}

export function createObject(db, { label, plural, description, nameType = "text", nameFormat, nameLabel, sharing }) {
  if (!plural) throw new MetadataError("Enter a plural label.");
  const name = `${slug(label)}__c`;
  if (objectExists(db, name)) throw new MetadataError(`Object ${name} already exists.`);
  if (sharing && !SHARING.includes(sharing)) throw new MetadataError("Unknown sharing setting.");
  tx(db, () => {
    const sort = db.prepare("SELECT coalesce(max(sort), 0) + 1 AS n FROM objects").get().n;
    db.prepare(`INSERT INTO objects (name, label, plural, prefix, custom, name_field, sharing, icon, description, sort)
      VALUES (?, ?, ?, ?, 1, 'name', ?, 'shapes', ?, ?)`).run(name, label, plural, nextPrefix(db),
      sharing ?? "public_rw", description ?? null, sort);
    const nameField = nameType === "autonumber"
      ? { name: "name", label: nameLabel ?? `${label} Number`, type: "autonumber",
        autonumber: { format: nameFormat || "{0000}", next: 1 }, searchable: true }
      : { name: "name", label: nameLabel ?? `${label} Name`, type: "text", required: true, searchable: true };
    insertField(db, name, nameField, 0);
    db.prepare("INSERT INTO layouts (object, sections, related, highlights) VALUES (?, ?, '[]', '[]')")
      .run(name, json([{ label: "Information", fields: ["name"] }]));
    insertView(db, name, { name: `All ${plural}`, columns: ["name", "owner", "updated_at"] });
  });
  return getObject(db, name);
}

export function updateObject(db, name, patch) {
  getObject(db, name);
  if (patch.sharing !== undefined && !SHARING.includes(patch.sharing)) throw new MetadataError("Unknown sharing setting.");
  if (patch.pathField) requireField(db, name, patch.pathField);
  const cols = { label: "label", plural: "plural", description: "description", sharing: "sharing", pathField: "path_field", icon: "icon" };
  for (const [key, col] of Object.entries(cols)) {
    if (patch[key] !== undefined) db.prepare(`UPDATE objects SET ${col} = ? WHERE name = ?`).run(patch[key], name);
  }
  return getObject(db, name);
}

function validateFieldDef(db, object, def) {
  if (!FIELD_TYPES.includes(def.type)) throw new MetadataError(`Unknown field type ${def.type}`);
  if (["picklist", "multipicklist"].includes(def.type)) {
    const values = (def.picklist ?? []).map((v) => String(v).trim()).filter(Boolean);
    if (!values.length) throw new MetadataError("A picklist needs at least one value.");
    if (new Set(values).size !== values.length) throw new MetadataError("Picklist values must be unique.");
    def.picklist = values;
  }
  if (def.type === "lookup") {
    const targets = String(def.referenceTo ?? "").split(",").filter(Boolean);
    if (!targets.length) throw new MetadataError("Choose the object this field looks up.");
    for (const t of targets) if (t !== "*" && !objectExists(db, t)) throw new MetadataError(`Unknown object ${t}`);
  }
  if (def.type === "formula") {
    if (!def.formula) throw new MetadataError("Enter a formula.");
    checkExpr(db, object, def.formula);
    if (!["text", "number", "currency", "percent", "date", "checkbox"].includes(def.returnType)) {
      throw new MetadataError("Choose what the formula returns.");
    }
  }
  if (def.type === "rollup") validateRollup(db, object, def);
  if (def.type === "autonumber") {
    const format = def.autonumber?.format ?? "{0000}";
    if (!/\{0+\}/.test(format)) throw new MetadataError("Autonumber format needs a {0000} part.");
    def.autonumber = { format, next: Number(def.autonumber?.next ?? 1) };
  }
}

function validateRollup(db, object, def) {
  const r = def.rollup ?? {};
  if (!objectExists(db, r.child)) throw new MetadataError(`Unknown object ${r.child}`);
  const via = getFields(db, r.child).find((x) => x.name === r.via);
  if (!via || via.type !== "lookup" || !via.referenceTo.split(",").includes(object)) {
    throw new MetadataError(`${r.child}.${r.via} does not look up ${object}`);
  }
  if (!ROLLUP_FNS.includes(r.fn)) throw new MetadataError(`Unknown roll-up function ${r.fn}`);
  if (r.fn !== "count") {
    const target = getFields(db, r.child).find((x) => x.name === r.field);
    const type = target && (target.type === "formula" ? target.returnType : target.type);
    if (!target || !(NUMERIC_TYPES.has(type) || (["min", "max"].includes(r.fn) && type === "date"))) {
      throw new MetadataError("Choose a number, currency or percent field to summarize.");
    }
  }
  if (r.filter) checkExpr(db, r.child, r.filter);
  def.rollup = { child: r.child, via: r.via, fn: r.fn, field: r.fn === "count" ? null : r.field, filter: r.filter || null };
  def.returnType = def.returnType ?? (r.fn === "count" ? "number" : getFields(db, r.child)
    .find((x) => x.name === r.field)?.type === "currency" ? "currency" : "number");
}

export function createField(db, object, input) {
  getObject(db, object);
  const name = input.name ?? `${slug(input.label)}__c`;
  if (RESERVED.has(name)) throw new MetadataError(`${name} is a reserved name.`);
  if (!input.label) throw new MetadataError("Enter a label.");
  if (fieldNamesOf(db, object).includes(name)) throw new MetadataError(`Field ${name} already exists.`);
  const def = { ...input, name, custom: true };
  validateFieldDef(db, object, def);
  tx(db, () => {
    const sort = db.prepare("SELECT coalesce(max(sort), 0) + 1 AS n FROM fields WHERE object = ?").get(object).n;
    insertField(db, object, def, sort);
    const layout = getObject(db, object).layout;
    if (layout.sections.length) layout.sections[0].fields.push(name);
    else layout.sections.push({ label: "Information", fields: [name] });
    db.prepare("UPDATE layouts SET sections = ? WHERE object = ?").run(json(layout.sections), object);
  });
  return getObject(db, object).fields.find((x) => x.name === name);
}

export function updateField(db, object, name, patch) {
  const field = getFields(db, object).find((x) => x.name === name);
  if (!field) throw new MetadataError(`Unknown field ${name} on ${object}`);
  if (patch.type !== undefined && patch.type !== field.type) throw new MetadataError("You cannot change a field's type.");
  const next = { ...field, ...patch };
  validateFieldDef(db, object, next);
  db.prepare(`UPDATE fields SET label = ?, required = ?, is_unique = ?, picklist = ?, formula = ?, rollup = ?,
      autonumber = ?, default_value = ?, searchable = ?, help = ?, return_type = ?, reference_to = ?
    WHERE object = ? AND name = ?`).run(next.label, next.required ? 1 : 0, next.unique ? 1 : 0, json(next.picklist),
    next.formula ?? null, json(next.rollup), json(next.autonumber), next.defaultValue ?? null,
    next.searchable ? 1 : 0, next.help ?? null, next.returnType ?? null, next.referenceTo ?? null, object, name);
  return getFields(db, object).find((x) => x.name === name);
}

export function deleteField(db, object, name) {
  const field = getFields(db, object).find((x) => x.name === name);
  if (!field) throw new MetadataError(`Unknown field ${name} on ${object}`);
  if (!field.custom) throw new MetadataError("You cannot delete a standard field.");
  tx(db, () => {
    db.prepare("DELETE FROM fields WHERE object = ? AND name = ?").run(object, name);
    const layout = getObject(db, object).layout;
    const sections = layout.sections.map((s) => ({ ...s, fields: s.fields.filter((x) => x !== name) }));
    const highlights = layout.highlights.filter((x) => x !== name);
    db.prepare("UPDATE layouts SET sections = ?, highlights = ? WHERE object = ?")
      .run(json(sections), json(highlights), object);
    for (const v of db.prepare("SELECT * FROM list_views WHERE object = ?").all(object)) {
      const columns = parse(v.columns, []).filter((c) => c !== name);
      const filters = parse(v.filters, []).filter((x) => x.field !== name);
      const sort = parse(v.sort)?.field === name ? null : parse(v.sort);
      db.prepare("UPDATE list_views SET columns = ?, filters = ?, sort = ? WHERE id = ?")
        .run(json(columns), json(filters), json(sort), v.id);
    }
  });
}

export function saveLayout(db, object, { sections = [], related = [], highlights = [] }) {
  const names = fieldNamesOf(db, object);
  for (const s of sections) {
    if (!s.label) throw new MetadataError("Every section needs a label.");
    for (const fname of s.fields ?? []) if (!names.includes(fname)) throw new MetadataError(`Unknown field ${fname}`);
  }
  for (const fname of highlights) if (!names.includes(fname)) throw new MetadataError(`Unknown field ${fname}`);
  for (const r of related) {
    if (!objectExists(db, r.object)) throw new MetadataError(`Unknown object ${r.object}`);
    requireField(db, r.object, r.field);
    for (const c of r.columns ?? []) requireField(db, r.object, c);
  }
  db.prepare("UPDATE layouts SET sections = ?, related = ?, highlights = ? WHERE object = ?")
    .run(json(sections.map((s) => ({ label: s.label, fields: s.fields ?? [] }))), json(related), json(highlights), object);
  return getObject(db, object).layout;
}

function viewFromRow(r) {
  return {
    id: r.id, object: r.object, name: r.name, ownerId: r.owner_id, shared: bool(r.shared), scope: r.scope,
    filters: parse(r.filters, []), columns: parse(r.columns, []), sort: parse(r.sort), kanbanField: r.kanban_field,
  };
}

function validateView(db, object, view) {
  if (!view.name) throw new MetadataError("Enter a view name.");
  if (view.scope && !["all", "mine"].includes(view.scope)) throw new MetadataError("Unknown scope.");
  for (const flt of view.filters ?? []) {
    requireField(db, object, flt.field);
    if (!FILTER_OPS.includes(flt.op)) throw new MetadataError(`Unknown filter operator ${flt.op}`);
  }
  for (const c of view.columns ?? []) requireField(db, object, c);
  if (view.sort?.field) requireField(db, object, view.sort.field);
  if (view.kanbanField) requireField(db, object, view.kanbanField);
}

export function listViews(db, object, user) {
  return db.prepare("SELECT * FROM list_views WHERE object = ? AND (shared = 1 OR owner_id = ?) ORDER BY rowid")
    .all(object, user.id).map(viewFromRow);
}

export function getListView(db, id) {
  const row = db.prepare("SELECT * FROM list_views WHERE id = ?").get(id);
  if (!row) throw new MetadataError("List view not found.");
  return viewFromRow(row);
}

export const isAdmin = (user) => user.profile === "admin";
export const canManage = (user, ownerId) => isAdmin(user) || (Boolean(ownerId) && ownerId === user.id);

export function createListView(db, user, view) {
  getObject(db, view.object);
  validateView(db, view.object, view);
  const id = insertView(db, view.object, view, user.id);
  return getListView(db, id);
}

export function updateListView(db, user, id, patch) {
  const view = getListView(db, id);
  if (!canManage(user, view.ownerId)) throw new MetadataError("You are not allowed to change this view.");
  const next = { ...view, ...patch };
  validateView(db, view.object, next);
  db.prepare(`UPDATE list_views SET name = ?, shared = ?, scope = ?, filters = ?, columns = ?, sort = ?, kanban_field = ?
    WHERE id = ?`).run(next.name, next.shared ? 1 : 0, next.scope, json(next.filters), json(next.columns),
    json(next.sort), next.kanbanField ?? null, id);
  return getListView(db, id);
}

export function deleteListView(db, user, id) {
  const view = getListView(db, id);
  if (!canManage(user, view.ownerId)) throw new MetadataError("You are not allowed to delete this view.");
  db.prepare("DELETE FROM list_views WHERE id = ?").run(id);
}

const ruleFromRow = (r) => ({ id: r.id, object: r.object, name: r.name, condition: r.condition, message: r.message,
  field: r.field, active: bool(r.active) });

export function listValidationRules(db, object) {
  return db.prepare("SELECT * FROM validation_rules WHERE object = ? ORDER BY name").all(object).map(ruleFromRow);
}

function validateRule(db, rule) {
  getObject(db, rule.object);
  if (!rule.name) throw new MetadataError("Enter a rule name.");
  if (!rule.message) throw new MetadataError("Enter an error message.");
  checkExpr(db, rule.object, rule.condition);
  if (rule.field) requireField(db, rule.object, rule.field);
}

export function createValidationRule(db, rule) {
  validateRule(db, rule);
  const id = insertRule(db, rule.object, rule);
  return ruleFromRow(db.prepare("SELECT * FROM validation_rules WHERE id = ?").get(id));
}

export function updateValidationRule(db, id, patch) {
  const row = db.prepare("SELECT * FROM validation_rules WHERE id = ?").get(id);
  if (!row) throw new MetadataError("Validation rule not found.");
  const next = { ...ruleFromRow(row), ...patch, object: row.object };
  validateRule(db, next);
  db.prepare("UPDATE validation_rules SET name = ?, condition = ?, message = ?, field = ?, active = ? WHERE id = ?")
    .run(next.name, next.condition, next.message, next.field ?? null, next.active ? 1 : 0, id);
  return ruleFromRow(db.prepare("SELECT * FROM validation_rules WHERE id = ?").get(id));
}

export function deleteValidationRule(db, id) {
  db.prepare("DELETE FROM validation_rules WHERE id = ?").run(id);
}

const automationFromRow = (r) => ({ id: r.id, object: r.object, name: r.name, trigger: r.trigger,
  criteria: r.criteria, actions: parse(r.actions, []), active: bool(r.active) });

function validateAutomation(db, a) {
  getObject(db, a.object);
  if (!a.name) throw new MetadataError("Enter a rule name.");
  if (!TRIGGERS.includes(a.trigger)) throw new MetadataError("Choose when the rule runs.");
  checkExpr(db, a.object, a.criteria || "TRUE");
  if (!a.actions?.length) throw new MetadataError("Add at least one action.");
  const fields = getObject(db, a.object).fields;
  for (const act of a.actions) {
    if (act.type === "set_field") {
      const target = fields.find((x) => x.name === act.field);
      if (!target || target.readonly) throw new MetadataError(`${act.field} cannot be set by automation.`);
      checkExpr(db, a.object, act.value);
    } else if (act.type === "create_task") {
      if (!act.subject) throw new MetadataError("A task action needs a subject.");
    } else {
      throw new MetadataError(`Unknown action ${act.type}`);
    }
  }
}

export function listAutomations(db, object) {
  const rows = object
    ? db.prepare("SELECT * FROM automations WHERE object = ? ORDER BY name").all(object)
    : db.prepare("SELECT * FROM automations ORDER BY object, name").all();
  return rows.map(automationFromRow);
}

export function createAutomation(db, a) {
  validateAutomation(db, a);
  const id = newId("301");
  db.prepare("INSERT INTO automations (id, object, name, trigger, criteria, actions, active) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, a.object, a.name, a.trigger, a.criteria || "TRUE", json(a.actions), a.active === false ? 0 : 1);
  return automationFromRow(db.prepare("SELECT * FROM automations WHERE id = ?").get(id));
}

export function updateAutomation(db, id, patch) {
  const row = db.prepare("SELECT * FROM automations WHERE id = ?").get(id);
  if (!row) throw new MetadataError("Automation rule not found.");
  const next = { ...automationFromRow(row), ...patch, object: row.object };
  validateAutomation(db, next);
  db.prepare("UPDATE automations SET name = ?, trigger = ?, criteria = ?, actions = ?, active = ? WHERE id = ?")
    .run(next.name, next.trigger, next.criteria || "TRUE", json(next.actions), next.active ? 1 : 0, id);
  return automationFromRow(db.prepare("SELECT * FROM automations WHERE id = ?").get(id));
}

export function deleteAutomation(db, id) {
  db.prepare("DELETE FROM automations WHERE id = ?").run(id);
}
