export const FIELD_TYPES = [
  "text", "textarea", "number", "currency", "percent", "date", "datetime", "checkbox", "picklist",
  "multipicklist", "email", "phone", "url", "lookup", "formula", "rollup", "autonumber",
];

export const COMPUTED_TYPES = new Set(["formula", "rollup", "autonumber"]);
export const NUMERIC_TYPES = new Set(["number", "currency", "percent"]);
export const FORMULA_RETURN_TYPES = ["text", "number", "currency", "percent", "date", "checkbox"];

export const aggKey = (a) => (a.fn === "count" ? "count" : `${a.fn}:${a.field}`);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT = 255;
const MAX_LONG_TEXT = 32000;

const blank = (v) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

function validDate(s) {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function displayType(field) {
  return field.type === "formula" || field.type === "rollup" ? field.returnType || "number" : field.type;
}

export function coerce(field, raw) {
  if (field.type === "checkbox") {
    if (blank(raw)) return { value: false };
    if (typeof raw === "boolean") return { value: raw };
    const s = String(raw).trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(s)) return { value: true };
    if (["false", "0", "no", "n"].includes(s)) return { value: false };
    return { error: "Choose true or false." };
  }
  if (field.type === "multipicklist") {
    const list = Array.isArray(raw) ? raw : blank(raw) ? [] : String(raw).split(";").map((s) => s.trim()).filter(Boolean);
    const bad = list.find((v) => !(field.picklist ?? []).includes(v));
    if (bad !== undefined) return { error: `"${bad}" is not an allowed value.` };
    return { value: list.length ? list : null };
  }
  if (blank(raw)) return { value: null };
  switch (field.type) {
    case "text": case "phone": case "url": case "lookup": {
      const s = String(raw).trim();
      return s.length > MAX_TEXT ? { error: `Use ${MAX_TEXT} characters or fewer.` } : { value: s };
    }
    case "textarea": {
      const s = String(raw);
      return s.length > MAX_LONG_TEXT ? { error: `Use ${MAX_LONG_TEXT} characters or fewer.` } : { value: s };
    }
    case "email": {
      const s = String(raw).trim();
      return EMAIL_RE.test(s) ? { value: s } : { error: "Enter a valid email address." };
    }
    case "number": case "currency": case "percent": {
      const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[,\s]/g, ""));
      return Number.isFinite(n) ? { value: n } : { error: "Enter a number." };
    }
    case "date": {
      const s = String(raw).trim().slice(0, 10);
      return validDate(s) ? { value: s } : { error: "Enter a date as YYYY-MM-DD." };
    }
    case "datetime": {
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? { error: "Enter a valid date and time." } : { value: d.toISOString() };
    }
    case "picklist": {
      const s = String(raw).trim();
      return (field.picklist ?? []).includes(s) ? { value: s } : { error: `"${s}" is not an allowed value.` };
    }
    default:
      return { value: raw };
  }
}

export function formatAutonumber(format, n) {
  return format.replace(/\{(0+)\}/, (_, zeros) => String(n).padStart(zeros.length, "0"));
}
