import { Link } from "react-router-dom";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, TextLink } from "@kasumi/ui";
import { COPY } from "@/copy.js";
import FieldValue from "@/records/FieldValue.jsx";
import { aggKey, aggLabel, formatterFor } from "@/insight/summary.js";

export default function ReportTable({ def, result, meta }) {
  const aggregates = [{ fn: "count" }, ...(def.aggregates ?? []).filter((a) => a.fn !== "count")];
  const byName = new Map(meta.fields.map((f) => [f.name, f]));
  if (result.groups.length) {
    const groupLabels = (def.groupBy ?? []).map((g) => byName.get(g)?.label ?? g);
    const rows = result.groups.flatMap((g) => [
      { key: g.key, label: g.label, values: g.values, depth: 0 },
      ...(g.subgroups ?? []).map((s) => ({ key: `${g.key}/${s.key}`, label: s.label, values: s.values, depth: 1 })),
    ]);
    return (
      <Table containerClassName="rounded-card border border-line">
        <TableHead><TableRow>
          <TableHeader>{groupLabels.join(" / ")}</TableHeader>
          {aggregates.map((a) => <TableHeader key={aggKey(a)} numeric>{aggLabel(a, meta)}</TableHeader>)}
        </TableRow></TableHead>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.key} className={r.depth === 0 && def.groupBy.length > 1 ? "bg-surface-subtle" : undefined}>
              <TableCell className={r.depth ? "pl-8" : "text-label"}>{r.label}</TableCell>
              {aggregates.map((a) => <TableCell key={aggKey(a)} numeric>{r.values[aggKey(a)] === null ? COPY.COMMON.BLANK : formatterFor(a, meta)(r.values[aggKey(a)])}</TableCell>)}
            </TableRow>
          ))}
          <TableRow className="bg-surface-subtle">
            <TableCell className="text-label">{COPY.REPORTS.TOTAL}</TableCell>
            {aggregates.map((a) => <TableCell key={aggKey(a)} numeric className="text-label">{result.totals[aggKey(a)] === null ? COPY.COMMON.BLANK : formatterFor(a, meta)(result.totals[aggKey(a)])}</TableCell>)}
          </TableRow>
        </TableBody>
      </Table>
    );
  }
  const cols = (def.columns?.length ? def.columns : [meta.fields[0].name]).map((c) => byName.get(c)).filter(Boolean);
  return (
    <Table containerClassName="rounded-card border border-line">
      <TableHead><TableRow>{cols.map((f) => <TableHeader key={f.name}>{f.label}</TableHeader>)}</TableRow></TableHead>
      <TableBody>
        {result.rows.length === 0 && <TableEmpty colSpan={cols.length}>{COPY.REPORTS.NO_ROWS}</TableEmpty>}
        {result.rows.map((r) => (
          <TableRow key={r.id}>
            {cols.map((f, i) => <TableCell key={f.name}>{i === 0 ? <TextLink as={Link} to={`/r/${meta.name}/${r.id}`}>{r.name || r.id}</TextLink> : <FieldValue field={f} record={r} />}</TableCell>)}
          </TableRow>
        ))}
        <TableRow className="bg-surface-subtle">
          <TableCell colSpan={cols.length} className="text-label">
            {COPY.REPORTS.TOTAL}: {aggregates.map((a) => `${aggLabel(a, meta)} ${formatterFor(a, meta)(result.totals[aggKey(a)] ?? 0)}`).join(" · ")}
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
