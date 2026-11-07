import { COPY } from "@/copy.js";
import { displayType, formatMoney, formatMoneyShort, formatNumber } from "@/format.js";

export { aggKey } from "@shared/field-types.js";

export function primaryAggregate(def) {
  return (def.aggregates ?? []).find((a) => a.fn !== "count") ?? { fn: "count" };
}

export function aggLabel(a, meta) {
  if (a.fn === "count") return COPY.REPORTS.RECORD_COUNT;
  const f = meta?.fields.find((x) => x.name === a.field);
  return COPY.REPORTS.AGG_LABEL(COPY.REPORTS.FN[a.fn], f?.label ?? a.field);
}

export function formatterFor(a, meta, short = false) {
  if (a.fn === "count") return formatNumber;
  const f = meta?.fields.find((x) => x.name === a.field);
  if (f && displayType(f) === "currency") return short ? formatMoneyShort : formatMoney;
  return formatNumber;
}
