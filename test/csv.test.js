import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDb } from "./helpers.js";
import { parseCsv, toCsv, importCsv, exportCsv } from "../server/csv.js";
import { createRecord, listRecords } from "../server/records.js";

test("parse handles quotes, commas, escaped quotes, newlines and CRLF", () => {
  assert.deepEqual(parseCsv('a,b\r\n"x, y","say ""hi"""\n"multi\nline",z\n'), [["a", "b"], ["x, y", 'say "hi"'], ["multi\nline", "z"]]);
});
test("parse ignores a BOM and blank trailing lines", () => assert.deepEqual(parseCsv("﻿a\n1\n\n"), [["a"], ["1"]]));
test("round trip", () => {
  const rows = [["a,b", 'c"d', "e\nf", "plain", ""]];
  assert.deepEqual(parseCsv(toCsv(rows)), rows);
});
test("toCsv neutralises spreadsheet formulas", () => assert.equal(toCsv([["=SUM(A1)", "+1", "-2", "@x", "ok"]]), "'=SUM(A1),'+1,'-2,'@x,ok\r\n"));

test("import maps headers by label or name, resolves lookups by name and reports bad rows", () => {
  const { ctx } = freshDb();
  createRecord(ctx(), "account", { name: "Acme" });
  const text = "Last Name,first_name,Email,Account Name,Shoe Size\nLee,Ann,ann@x.test,Acme,9\n,Bob,bob@x.test,,\nKim,,not-an-email,,\n";
  const res = importCsv(ctx(), "contact", text);
  assert.equal(res.created, 1);
  assert.deepEqual(res.skippedColumns, ["Shoe Size"]);
  assert.equal(res.errors.length, 2);
  assert.equal(res.errors[0].row, 3);
  assert.equal(res.errors[0].errors.last_name, "Complete this field.");
  assert.match(res.errors[1].errors.email, /valid email/);
  const c = listRecords(ctx(), "contact", {}).records[0];
  assert.equal(c.$names.account, "Acme");
});

test("import rejects an empty file and a file with no known columns", () => {
  const { ctx } = freshDb();
  assert.throws(() => importCsv(ctx(), "contact", ""), /empty/);
  assert.throws(() => importCsv(ctx(), "contact", "foo,bar\n1,2\n"), /No columns/);
});

test("export writes labels and lookup names", () => {
  const { ctx } = freshDb();
  const acc = createRecord(ctx(), "account", { name: "Acme" });
  createRecord(ctx(), "contact", { last_name: "Lee", account: acc.id });
  const csv = exportCsv(ctx(), "contact", { columns: ["name", "account", "owner"] });
  assert.deepEqual(parseCsv(csv), [["Name", "Account Name", "Owner"], ["Lee", "Acme", "Ada Admin"]]);
});
