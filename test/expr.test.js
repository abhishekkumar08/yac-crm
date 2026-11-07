import { test } from "node:test";
import assert from "node:assert/strict";
import { compile, check, ExprError } from "../server/expr.js";

const run = (src, rec = {}, ctx) => compile(src)(rec, ctx);

test("arithmetic and precedence", () => assert.equal(run("1 + 2 * 3"), 7));
test("parentheses", () => assert.equal(run("(1 + 2) * 3"), 9));
test("unary minus and not", () => { assert.equal(run("-2 + 5"), 3); assert.equal(run("!TRUE"), false); });
test("fields are case-insensitive", () => assert.equal(run("Amount * probability / 100", { amount: 1000, probability: 20 }), 200));
test("string concat with &", () => assert.equal(run("first_name & ' ' & last_name", { first_name: "Ada", last_name: "L" }), "Ada L"));
test("double-quoted strings", () => assert.equal(run('"a" & "b"'), "ab"));
test("comparison operators", () => {
  assert.equal(run("2 = 2"), true); assert.equal(run("2 == 3"), false); assert.equal(run("2 != 3"), true);
  assert.equal(run("2 <> 2"), false); assert.equal(run("2 <= 2"), true); assert.equal(run("3 > 2"), true);
});
test("logical && || AND OR NOT", () => {
  assert.equal(run("TRUE && FALSE"), false); assert.equal(run("TRUE || FALSE"), true);
  assert.equal(run("AND(TRUE, TRUE, FALSE)"), false); assert.equal(run("OR(FALSE, TRUE)"), true); assert.equal(run("NOT(FALSE)"), true);
});
test("IF and ISBLANK", () => {
  assert.equal(run("IF(ISBLANK(email), 'none', email)"), "none");
  assert.equal(run("IF(ISBLANK(email), 'none', email)", { email: "a@b.c" }), "a@b.c");
  assert.equal(run("ISBLANK('')"), true);
});
test("ISPICKVAL and INCLUDES", () => {
  assert.equal(run("ISPICKVAL(stage, 'Closed Won')", { stage: "Closed Won" }), true);
  assert.equal(run("INCLUDES(tags, 'B')", { tags: ["A", "B"] }), true);
});
test("text functions", () => {
  assert.equal(run("UPPER('ab') & LOWER('CD') & TRIM('  x ')"), "ABcdx");
  assert.equal(run("LEN('hello')"), 5);
  assert.equal(run("CONTAINS('hello', 'ell')"), true);
  assert.equal(run("BEGINS('hello', 'he')"), true);
  assert.equal(run("TEXT(5) & VALUE('3')"), "53");
});
test("math functions", () => {
  assert.equal(run("ROUND(2.345, 2)"), 2.35);
  assert.equal(run("FLOOR(2.7) + CEILING(2.1) + ABS(-1)"), 6);
  assert.equal(run("MAX(1, 5, 3) - MIN(4, 2)"), 3);
});
test("CASE and BLANKVALUE", () => {
  assert.equal(run("CASE(priority, 'High', 3, 'Medium', 2, 1)", { priority: "Medium" }), 2);
  assert.equal(run("CASE(priority, 'High', 3, 1)", {}), 1);
  assert.equal(run("BLANKVALUE(x, 'dflt')"), "dflt");
});
test("date math against TODAY", () => {
  const today = new Date("2026-01-01T10:00:00Z");
  assert.equal(run("close_date - TODAY()", { close_date: "2026-01-11" }, { today }), 10);
  assert.equal(run("TODAY() + 3", {}, { today }), "2026-01-04");
  assert.equal(run("YEAR(close_date) * 100 + MONTH(close_date)", { close_date: "2026-03-09" }), 202603);
  assert.equal(run("DAY(DATE(2026, 2, 7))"), 7);
});
test("ISNEW, ISCHANGED and PRIORVALUE", () => {
  const f = "ISCHANGED(stage) && PRIORVALUE(stage) = 'Prospecting'";
  assert.equal(run(f, { stage: "Qualification" }, { prior: { stage: "Prospecting" } }), true);
  assert.equal(run(f, { stage: "Prospecting" }, { prior: { stage: "Prospecting" } }), false);
  assert.equal(run("ISNEW()", {}, { isNew: true }), true);
  assert.equal(run("ISCHANGED(stage)", { stage: "A" }, { isNew: true }), false);
});
test("null-safe arithmetic and comparison", () => {
  assert.equal(run("amount > 100"), false);
  assert.equal(run("amount * 2"), null);
  assert.equal(run("'x' & missing"), "x");
});
test("syntax error reports position", () => assert.throws(() => compile("1 +"), (e) => e instanceof ExprError && /position 3/.test(e.message)));
test("unclosed string is an error", () => assert.throws(() => compile("'abc"), ExprError));
test("unknown function rejected at compile time", () => assert.throws(() => compile("EVAL(1)"), /Unknown function EVAL/));
test("wrong argument count rejected", () => assert.throws(() => compile("IF(TRUE, 1)"), /IF expects/));
test("prototype properties are not reachable", () => {
  assert.equal(run("constructor"), null);
  assert.equal(run("__proto__"), null);
});
test("check returns ok or the error message", () => {
  assert.deepEqual(check("1 + 1"), { ok: true });
  assert.equal(check("1 +").ok, false);
});
test("check validates field names against a list", () => {
  assert.equal(check("amount + 1", ["amount"]).ok, true);
  assert.match(check("amont + 1", ["amount"]).error, /Unknown field amont/);
});
