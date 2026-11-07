import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDb } from "./helpers.js";
import { assistant } from "../server/assistant.js";
import { createRecord } from "../server/records.js";

const TODAY = new Date("2026-03-10T12:00:00");
const day = (n) => { const d = new Date(TODAY); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

test("flags overdue tasks, quiet deals closing soon, and untouched leads", () => {
  const { ctx, db } = freshDb();
  const c = { ...ctx("rep"), today: TODAY };
  createRecord(c, "task", { subject: "Late", due_date: day(-2) });
  createRecord(c, "task", { subject: "Done", due_date: day(-2), status: "Completed" });
  const quiet = createRecord(c, "opportunity", { name: "Quiet deal", close_date: day(5) });
  const busy = createRecord(c, "opportunity", { name: "Busy deal", close_date: day(5) });
  createRecord(c, "task", { subject: "Call", what: busy.id, due_date: day(1) });
  createRecord(c, "opportunity", { name: "Far deal", close_date: day(40) });
  const lead = createRecord(c, "lead", { last_name: "Old", company: "C" });
  db.prepare("UPDATE records SET created_at = ? WHERE id = ?").run(`${day(-9)}T09:00:00.000Z`, lead.id);
  createRecord(c, "lead", { last_name: "Fresh", company: "C" });

  const items = assistant(c);
  const byKind = Object.fromEntries(items.map((i) => [i.kind, i]));
  assert.equal(byKind.overdue_tasks.count, 1);
  assert.deepEqual(byKind.quiet_deals.records.map((r) => r.id), [quiet.id]);
  assert.deepEqual(byKind.stale_leads.records.map((r) => r.id), [lead.id]);
});

test("nothing to flag gives an empty list", () => {
  const { ctx } = freshDb();
  assert.deepEqual(assistant({ ...ctx("peer"), today: TODAY }), []);
});
