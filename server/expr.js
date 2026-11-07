import { pad, ymd } from "../shared/dates.js";

export class ExprError extends Error {}

const TWO_CHAR = ["&&", "||", "==", "!=", "<>", "<=", ">="];
const ONE_CHAR = "=<>+-*/&!(),";

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    const start = i;
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      while (i < src.length && /[0-9.]/.test(src[i])) i++;
      tokens.push({ k: "num", v: Number(src.slice(start, i)), pos: start });
    } else if (c === "'" || c === '"') {
      let v = "";
      i++;
      while (i < src.length && src[i] !== c) {
        if (src[i] === "\\" && i + 1 < src.length) i++;
        v += src[i++];
      }
      if (i >= src.length) throw new ExprError(`Unclosed string at position ${start}`);
      i++;
      tokens.push({ k: "str", v, pos: start });
    } else if (/[A-Za-z_]/.test(c)) {
      while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) i++;
      tokens.push({ k: "id", v: src.slice(start, i), pos: start });
    } else if (TWO_CHAR.includes(src.slice(i, i + 2))) {
      tokens.push({ k: "op", v: src.slice(i, i + 2), pos: start });
      i += 2;
    } else if (ONE_CHAR.includes(c)) {
      tokens.push({ k: "op", v: c, pos: start });
      i++;
    } else {
      throw new ExprError(`Unexpected character '${c}' at position ${start}`);
    }
  }
  tokens.push({ k: "eof", pos: src.length });
  return tokens;
}

const FUNCTIONS = {
  IF: [3, 3], AND: [1, Infinity], OR: [1, Infinity], NOT: [1, 1], ISBLANK: [1, 1], ISPICKVAL: [2, 2],
  INCLUDES: [2, 2], TODAY: [0, 0], NOW: [0, 0], LEN: [1, 1], UPPER: [1, 1], LOWER: [1, 1], TRIM: [1, 1],
  TEXT: [1, 1], VALUE: [1, 1], ROUND: [2, 2], FLOOR: [1, 1], CEILING: [1, 1], ABS: [1, 1],
  MAX: [1, Infinity], MIN: [1, Infinity], CONTAINS: [2, 2], BEGINS: [2, 2], ISNEW: [0, 0],
  ISCHANGED: [1, 1], PRIORVALUE: [1, 1], BLANKVALUE: [2, 2], CASE: [4, Infinity], DATE: [3, 3],
  YEAR: [1, 1], MONTH: [1, 1], DAY: [1, 1],
};
const FIELD_ARG = new Set(["ISCHANGED", "PRIORVALUE"]);
const KEYWORDS = { TRUE: true, FALSE: false, NULL: null };

function parse(src) {
  const tokens = tokenize(src);
  let p = 0;
  const peek = () => tokens[p];
  const fail = (t) => {
    throw new ExprError(t.k === "eof"
      ? `Unexpected end of expression at position ${t.pos}`
      : `Unexpected '${t.v}' at position ${t.pos}`);
  };
  const isOp = (...ops) => peek().k === "op" && ops.includes(peek().v);
  const expect = (v) => (isOp(v) ? tokens[p++] : fail(peek()));

  const binary = (next, ops) => () => {
    let left = next();
    while (isOp(...ops)) {
      const op = tokens[p++].v;
      left = { t: "bin", op, l: left, r: next() };
    }
    return left;
  };

  const primary = () => {
    const t = tokens[p++];
    if (t.k === "num" || t.k === "str") return { t: "lit", v: t.v };
    if (t.k === "op" && t.v === "(") {
      const e = or();
      expect(")");
      return e;
    }
    if (t.k === "id") {
      const upper = t.v.toUpperCase();
      if (isOp("(")) {
        if (!(upper in FUNCTIONS)) throw new ExprError(`Unknown function ${t.v} at position ${t.pos}`);
        p++;
        const args = [];
        if (!isOp(")")) {
          args.push(or());
          while (isOp(",")) { p++; args.push(or()); }
        }
        expect(")");
        const [min, max] = FUNCTIONS[upper];
        if (args.length < min || args.length > max) {
          throw new ExprError(`${upper} expects ${min === max ? min : `${min}+`} argument(s), got ${args.length}`);
        }
        if (FIELD_ARG.has(upper) && args[0].t !== "field") throw new ExprError(`${upper} expects a field name`);
        return { t: "call", fn: upper, args };
      }
      if (upper in KEYWORDS) return { t: "lit", v: KEYWORDS[upper] };
      return { t: "field", name: t.v };
    }
    return fail(t);
  };
  const unary = () => {
    if (isOp("-", "!")) {
      const op = tokens[p++].v;
      return { t: "un", op, e: unary() };
    }
    return primary();
  };
  const mul = binary(unary, ["*", "/"]);
  const add = binary(mul, ["+", "-", "&"]);
  const cmp = binary(add, ["=", "==", "!=", "<>", "<", ">", "<=", ">="]);
  const and = binary(cmp, ["&&"]);
  const or = binary(and, ["||"]);

  const ast = or();
  if (peek().k !== "eof") fail(peek());
  return ast;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}/;
const isDate = (v) => typeof v === "string" && DATE_RE.test(v);
const dayNumber = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000;
const fromDayNumber = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
const isBlank = (v) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

function getField(record, name) {
  if (!record) return null;
  if (Object.hasOwn(record, name)) return record[name] ?? null;
  const lower = name.toLowerCase();
  const key = Object.keys(record).find((k) => k.toLowerCase() === lower);
  return key === undefined ? null : record[key] ?? null;
}

function equals(a, b) {
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return String(a) === String(b);
  return a === b;
}

function arith(op, a, b) {
  if (a === null || b === null) return null;
  if (op === "+" && isDate(a) && typeof b === "number") return fromDayNumber(dayNumber(a) + b);
  if (op === "-" && isDate(a) && typeof b === "number") return fromDayNumber(dayNumber(a) - b);
  if (op === "-" && isDate(a) && isDate(b)) return dayNumber(a) - dayNumber(b);
  const x = Number(a), y = Number(b);
  if (Number.isNaN(x) || Number.isNaN(y)) return null;
  if (op === "+") return x + y;
  if (op === "-") return x - y;
  if (op === "*") return x * y;
  return y === 0 ? null : x / y;
}

function compare(op, a, b) {
  if (op === "=" || op === "==") return equals(a, b);
  if (op === "!=" || op === "<>") return !equals(a, b);
  if (a === null || b === null) return false;
  const [x, y] = typeof a === "number" || typeof b === "number" ? [Number(a), Number(b)] : [a, b];
  if (op === "<") return x < y;
  if (op === ">") return x > y;
  if (op === "<=") return x <= y;
  return x >= y;
}

const round = (x, n) => Number(`${Math.round(Number(`${x}e${n}`))}e-${n}`);

function evaluate(node, rec, ctx) {
  const ev = (n) => evaluate(n, rec, ctx);
  switch (node.t) {
    case "lit": return node.v;
    case "field": return getField(rec, node.name);
    case "un": {
      const v = ev(node.e);
      if (node.op === "!") return !v;
      return v === null ? null : -Number(v);
    }
    case "bin": {
      if (node.op === "&&") return Boolean(ev(node.l)) && Boolean(ev(node.r));
      if (node.op === "||") return Boolean(ev(node.l)) || Boolean(ev(node.r));
      const a = ev(node.l), b = ev(node.r);
      if (node.op === "&") return `${a ?? ""}${b ?? ""}`;
      if ("+-*/".includes(node.op)) return arith(node.op, a, b);
      return compare(node.op, a, b);
    }
    default: return call(node, rec, ctx, ev);
  }
}

function call({ fn, args }, rec, ctx, ev) {
  const vals = () => args.map(ev);
  switch (fn) {
    case "IF": return ev(args[0]) ? ev(args[1]) : ev(args[2]);
    case "AND": return args.every((a) => Boolean(ev(a)));
    case "OR": return args.some((a) => Boolean(ev(a)));
    case "NOT": return !ev(args[0]);
    case "ISBLANK": return isBlank(ev(args[0]));
    case "BLANKVALUE": { const v = ev(args[0]); return isBlank(v) ? ev(args[1]) : v; }
    case "ISPICKVAL": return equals(ev(args[0]), ev(args[1]));
    case "INCLUDES": {
      const [v, item] = vals();
      const list = Array.isArray(v) ? v : typeof v === "string" ? v.split(";") : [];
      return list.includes(item);
    }
    case "TODAY": return ymd(ctx.today ?? new Date());
    case "NOW": return (ctx.today ?? new Date()).toISOString();
    case "LEN": return String(ev(args[0]) ?? "").length;
    case "UPPER": return String(ev(args[0]) ?? "").toUpperCase();
    case "LOWER": return String(ev(args[0]) ?? "").toLowerCase();
    case "TRIM": return String(ev(args[0]) ?? "").trim();
    case "TEXT": { const v = ev(args[0]); return v === null ? "" : String(v); }
    case "VALUE": { const n = Number(ev(args[0])); return Number.isNaN(n) ? null : n; }
    case "ROUND": { const [x, n] = vals(); return x === null ? null : round(Number(x), Number(n)); }
    case "FLOOR": { const x = ev(args[0]); return x === null ? null : Math.floor(x); }
    case "CEILING": { const x = ev(args[0]); return x === null ? null : Math.ceil(x); }
    case "ABS": { const x = ev(args[0]); return x === null ? null : Math.abs(x); }
    case "MAX": { const v = vals().filter((x) => x !== null); return v.length ? Math.max(...v) : null; }
    case "MIN": { const v = vals().filter((x) => x !== null); return v.length ? Math.min(...v) : null; }
    case "CONTAINS": { const [s, sub] = vals(); return String(s ?? "").includes(String(sub ?? "")); }
    case "BEGINS": { const [s, pre] = vals(); return String(s ?? "").startsWith(String(pre ?? "")); }
    case "ISNEW": return Boolean(ctx.isNew);
    case "ISCHANGED": {
      if (ctx.isNew || !ctx.prior) return false;
      return !equals(getField(rec, args[0].name), getField(ctx.prior, args[0].name));
    }
    case "PRIORVALUE": return ctx.prior ? getField(ctx.prior, args[0].name) : null;
    case "CASE": {
      const subject = ev(args[0]);
      for (let i = 1; i + 1 < args.length; i += 2) if (equals(subject, ev(args[i]))) return ev(args[i + 1]);
      return args.length % 2 === 0 ? ev(args[args.length - 1]) : null;
    }
    case "DATE": { const [y, m, d] = vals(); return `${y}-${pad(m)}-${pad(d)}`; }
    case "YEAR": { const v = ev(args[0]); return isDate(v) ? +v.slice(0, 4) : null; }
    case "MONTH": { const v = ev(args[0]); return isDate(v) ? +v.slice(5, 7) : null; }
    case "DAY": { const v = ev(args[0]); return isDate(v) ? +v.slice(8, 10) : null; }
    default: throw new ExprError(`Unknown function ${fn}`);
  }
}

function fieldNames(node, out = new Set()) {
  if (node.t === "field") out.add(node.name);
  for (const child of [node.l, node.r, node.e, ...(node.args ?? [])]) if (child) fieldNames(child, out);
  return out;
}

export function compile(src) {
  const ast = parse(String(src ?? ""));
  return (record, ctx = {}) => evaluate(ast, record, ctx);
}

export function check(src, knownFields) {
  try {
    const ast = parse(String(src ?? ""));
    if (knownFields) {
      const known = new Set(knownFields.map((f) => f.toLowerCase()));
      for (const name of fieldNames(ast)) {
        if (!known.has(name.toLowerCase())) return { ok: false, error: `Unknown field ${name}` };
      }
    }
    return { ok: true };
  } catch (err) {
    if (err instanceof ExprError) return { ok: false, error: err.message };
    throw err;
  }
}
