import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDb } from "./helpers.js";
import { createRecord } from "../server/records.js";
import { updateObject } from "../server/metadata.js";
import { runReport, forecast, saveReport, listReports, deleteReport, saveDashboard, runDashboard, globalSearch, ReportError } from "../server/reports.js";

function seed(env) {
  const { ctx } = env;
  const opp = (who, name, stage, amount, close_date) => createRecord(ctx(who), "opportunity", { name, stage, amount, close_date });
  opp("rep", "A", "Prospecting", 100, "2026-02-10");
  opp("rep", "B", "Negotiation/Review", 200, "2026-02-20");
  opp("rep", "C", "Closed Won", 400, "2026-05-01");
  opp("peer", "D", "Closed Won", 800, "2026-05-15");
  opp("peer", "E", "Proposal/Price Quote", 50, "2026-08-01");
}

test("tabular report returns rows and totals", () => {
  const env = freshDb(); seed(env);
  const r = runReport(env.ctx(), { object: "opportunity", columns: ["name", "amount"], aggregates: [{ fn: "sum", field: "amount" }], sort: { field: "amount", dir: "desc" } });
  assert.deepEqual(r.rows.map((x) => x.name), ["D", "C", "B", "A", "E"]);
  assert.equal(r.totals.count, 5);
  assert.equal(r.totals["sum:amount"], 1550);
});

test("group by stage with sum(amount) follows picklist order", () => {
  const env = freshDb(); seed(env);
  const r = runReport(env.ctx(), { object: "opportunity", groupBy: ["stage"], aggregates: [{ fn: "sum", field: "amount" }] });
  assert.deepEqual(r.groups.map((g) => g.label), ["Prospecting", "Proposal/Price Quote", "Negotiation/Review", "Closed Won"]);
  assert.equal(r.groups.find((g) => g.label === "Closed Won").values["sum:amount"], 1200);
  assert.equal(r.groups.find((g) => g.label === "Closed Won").values.count, 2);
});

test("two-level grouping: subgroup totals add up to their group", () => {
  const env = freshDb(); seed(env);
  const r = runReport(env.ctx(), { object: "opportunity", groupBy: ["owner", "is_won"], aggregates: [{ fn: "sum", field: "amount" }] });
  for (const g of r.groups) {
    assert.equal(g.subgroups.reduce((s, x) => s + x.values["sum:amount"], 0), g.values["sum:amount"]);
  }
  assert.deepEqual(r.groups.map((g) => g.label).sort(), ["Pat Peer", "Rae Rep"]);
});

test("date group-by buckets by month; avg/min/max work", () => {
  const env = freshDb(); seed(env);
  const r = runReport(env.ctx(), { object: "opportunity", groupBy: ["close_date"], aggregates: [{ fn: "avg", field: "amount" }, { fn: "max", field: "amount" }] });
  const feb = r.groups.find((g) => g.key === "2026-02");
  assert.equal(feb.values["avg:amount"], 150);
  assert.equal(feb.values["max:amount"], 200);
});

test("report filters and sharing apply", () => {
  const env = freshDb(); seed(env);
  updateObject(env.db, "opportunity", { sharing: "private" });
  const r = runReport(env.ctx("rep"), { object: "opportunity", filters: [{ field: "is_won", op: "eq", value: true }] });
  assert.deepEqual(r.rows.map((x) => x.name), ["C"]);
});

test("bad report definitions are rejected", () => {
  const env = freshDb();
  assert.throws(() => runReport(env.ctx(), { object: "opportunity", groupBy: ["ghost"] }), ReportError);
  assert.throws(() => runReport(env.ctx(), { object: "opportunity", aggregates: [{ fn: "sum", field: "name" }] }), /number field/);
  assert.throws(() => runReport(env.ctx(), { object: "opportunity", groupBy: ["stage", "type", "owner"] }), /two/);
});

test("forecast buckets by quarter and owner", () => {
  const env = freshDb(); seed(env);
  const rows = forecast(env.ctx(), { year: 2026 });
  const q1rep = rows.find((r) => r.quarter === 1 && r.ownerName === "Rae Rep");
  assert.deepEqual([q1rep.closed, q1rep.commit, q1rep.bestCase, q1rep.pipeline], [0, 200, 200, 300]);
  const q2peer = rows.find((r) => r.quarter === 2 && r.ownerName === "Pat Peer");
  assert.equal(q2peer.closed, 800);
  const q3peer = rows.find((r) => r.quarter === 3 && r.ownerName === "Pat Peer");
  assert.deepEqual([q3peer.commit, q3peer.bestCase, q3peer.pipeline], [0, 50, 50]);
});

test("saved reports and dashboards", () => {
  const env = freshDb(); seed(env);
  const rep = saveReport(env.ctx("rep"), { name: "By stage", def: { object: "opportunity", groupBy: ["stage"], aggregates: [{ fn: "sum", field: "amount" }], chart: "bar" } });
  assert.ok(listReports(env.ctx("peer")).some((r) => r.id === rep.id));
  assert.throws(() => deleteReport(env.ctx("peer"), rep.id), /not allowed/);
  const dash = saveDashboard(env.ctx("rep"), { name: "Sales", components: [{ reportId: rep.id, type: "bar", title: "Pipeline" }, { reportId: rep.id, type: "metric", title: "Total" }] });
  const out = runDashboard(env.ctx("rep"), dash.id);
  assert.equal(out.components.length, 2);
  assert.equal(out.components[0].result.groups.length, 4);
  assert.equal(out.components[1].result.totals["sum:amount"], 1550);
  deleteReport(env.ctx("rep"), rep.id);
  assert.match(runDashboard(env.ctx("rep"), dash.id).components[0].error, /deleted/);
});

test("global search finds records across objects and respects sharing", () => {
  const env = freshDb();
  const { ctx, db } = env;
  createRecord(ctx("rep"), "account", { name: "Zephyr Labs" });
  createRecord(ctx("rep"), "contact", { last_name: "Zed", email: "zz@zephyr.test" });
  createRecord(ctx("peer"), "lead", { last_name: "Q", company: "Zephyr Partners" });
  updateObject(db, "lead", { sharing: "private" });
  const res = globalSearch(ctx("rep"), "zephyr");
  assert.deepEqual(res.map((g) => g.object).sort(), ["account", "contact"]);
  assert.equal(globalSearch(ctx("manager"), "zephyr").length, 3);
  assert.deepEqual(globalSearch(ctx("rep"), " "), []);
});
