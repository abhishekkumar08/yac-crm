import { listRecords } from "./records.js";
import { ymd, addDays } from "../shared/dates.js";

const SHOW = 5;
const CLOSING_DAYS = 7;
const QUIET_DAYS = 14;
const STALE_LEAD_DAYS = 7;

function hasRecentActivity(db, recordId, since) {
  return Boolean(db.prepare(`SELECT 1 FROM records WHERE object IN ('task', 'event') AND deleted_at IS NULL
    AND (json_extract(data, '$.what') = ? OR json_extract(data, '$.who') = ?) AND updated_at >= ? LIMIT 1`).get(recordId, recordId, since));
}

export function assistant(ctx) {
  const today = ctx.today ?? new Date();
  const t = ymd(today);
  const items = [];

  const overdue = listRecords(ctx, "task", { scope: "mine", limit: SHOW, sort: { field: "due_date", dir: "asc" },
    filters: [{ field: "status", op: "ne", value: "Completed" }, { field: "due_date", op: "lt", value: t }] });
  if (overdue.total) items.push({ kind: "overdue_tasks", count: overdue.total, records: overdue.records });

  const closing = listRecords(ctx, "opportunity", { scope: "mine", limit: null, sort: { field: "close_date", dir: "asc" },
    filters: [{ field: "is_closed", op: "eq", value: false }, { field: "close_date", op: "gte", value: t },
      { field: "close_date", op: "lte", value: ymd(addDays(today, CLOSING_DAYS)) }] });
  const since = ymd(addDays(today, -QUIET_DAYS));
  const quiet = closing.records.filter((o) => !hasRecentActivity(ctx.db, o.id, since));
  if (quiet.length) items.push({ kind: "quiet_deals", count: quiet.length, records: quiet.slice(0, SHOW) });

  const stale = listRecords(ctx, "lead", { scope: "mine", limit: SHOW, sort: { field: "created_at", dir: "asc" },
    filters: [{ field: "status", op: "eq", value: "Open - Not Contacted" },
      { field: "created_at", op: "lte", value: ymd(addDays(today, -STALE_LEAD_DAYS)) }] });
  if (stale.total) items.push({ kind: "stale_leads", count: stale.total, records: stale.records });

  return items;
}
