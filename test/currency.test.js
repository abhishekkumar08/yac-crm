import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDb } from "./helpers.js";
import { getSettings, saveCurrencies, convert } from "../server/currency.js";
import { getObject, createField } from "../server/metadata.js";
import { createRecord, getRecord, ValidationError } from "../server/records.js";
import { runReport, forecast } from "../server/reports.js";

function enable(db) {
  saveCurrencies(db, { multiCurrency: true, corporate: "USD", currencies: [
    { isoCode: "USD", name: "US Dollar", rate: 1, active: true },
    { isoCode: "EUR", name: "Euro", rate: 0.5, active: true },
    { isoCode: "INR", name: "Indian Rupee", rate: 80, active: false },
  ] });
}

test("single currency by default: no record currency field", () => {
  const { db } = freshDb();
  assert.equal(getSettings(db).multiCurrency, false);
  assert.ok(!getObject(db, "opportunity").fields.some((f) => f.name === "currency_iso_code"));
});

test("convert goes through the corporate currency", () => {
  const { db } = freshDb();
  enable(db);
  assert.equal(convert(db, 100, "EUR", "USD"), 200);
  assert.equal(convert(db, 200, "USD", "EUR"), 100);
  assert.equal(convert(db, null, "EUR", "USD"), null);
});

test("records get the corporate currency by default and reject inactive codes", () => {
  const { db, ctx } = freshDb();
  enable(db);
  const field = getObject(db, "opportunity").fields.find((f) => f.name === "currency_iso_code");
  assert.deepEqual(field.picklist, ["EUR", "USD"]);
  assert.equal(createRecord(ctx(), "account", { name: "A" }).currency_iso_code, "USD");
  assert.throws(() => createRecord(ctx(), "account", { name: "B", currency_iso_code: "INR" }), ValidationError);
});

test("line items and quotes take the opportunity's currency", () => {
  const { db, ctx } = freshDb();
  enable(db);
  const p = createRecord(ctx(), "product", { name: "W" });
  const opp = createRecord(ctx(), "opportunity", { name: "O", close_date: "2026-01-01", currency_iso_code: "EUR" });
  const li = createRecord(ctx(), "opportunity_line_item", { opportunity: opp.id, product: p.id, quantity: 1, unit_price: 10, currency_iso_code: "USD" });
  assert.equal(li.currency_iso_code, "EUR");
  const q = createRecord(ctx(), "quote", { name: "Q", opportunity: opp.id });
  assert.equal(q.currency_iso_code, "EUR");
});

test("roll-ups convert child amounts into the parent's currency", () => {
  const { db, ctx } = freshDb();
  enable(db);
  createField(db, "account", { label: "Pipeline", type: "rollup", rollup: { child: "opportunity", via: "account", fn: "sum", field: "amount" } });
  const acc = createRecord(ctx(), "account", { name: "A", currency_iso_code: "USD" });
  createRecord(ctx(), "opportunity", { name: "1", close_date: "2026-01-01", amount: 100, currency_iso_code: "EUR", account: acc.id });
  createRecord(ctx(), "opportunity", { name: "2", close_date: "2026-01-01", amount: 50, currency_iso_code: "USD", account: acc.id });
  assert.equal(getRecord(ctx(), "account", acc.id).pipeline__c, 250);
});

test("report sums and forecast are in the corporate currency", () => {
  const { db, ctx } = freshDb();
  enable(db);
  createRecord(ctx(), "opportunity", { name: "1", close_date: "2026-02-01", amount: 100, currency_iso_code: "EUR" });
  createRecord(ctx(), "opportunity", { name: "2", close_date: "2026-02-01", amount: 50, currency_iso_code: "USD" });
  const r = runReport(ctx(), { object: "opportunity", aggregates: [{ fn: "sum", field: "amount" }] });
  assert.equal(r.totals["sum:amount"], 250);
  assert.equal(forecast(ctx(), { year: 2026 })[0].pipeline, 250);
});

test("corporate currency must be active and rates positive", () => {
  const { db } = freshDb();
  assert.throws(() => saveCurrencies(db, { multiCurrency: true, corporate: "EUR", currencies: [{ isoCode: "EUR", name: "Euro", rate: 1, active: false }] }), /corporate currency must be active/i);
  assert.throws(() => saveCurrencies(db, { multiCurrency: true, corporate: "USD", currencies: [{ isoCode: "USD", name: "US", rate: 1, active: true }, { isoCode: "EUR", name: "E", rate: 0, active: true }] }), /rate/i);
});
