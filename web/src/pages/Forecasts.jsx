import { useState } from "react";
import { EmptyState, ErrorState, LoadingTable, PageHeader, Select, StatCard, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@kasumi/ui";
import { TrendingUp } from "lucide-react";
import { COPY } from "@/copy.js";
import { useApi } from "@/hooks.js";
import { formatMoney } from "@/format.js";

const KEYS = ["closed", "commit", "bestCase", "pipeline"];
const LABELS = { closed: COPY.FORECAST.CLOSED, commit: COPY.FORECAST.COMMIT, bestCase: COPY.FORECAST.BEST, pipeline: COPY.FORECAST.PIPELINE };
const sum = (rows, k) => rows.reduce((s, r) => s + r[k], 0);

export default function Forecasts() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const { data, error, loading, reload } = useApi(`/forecast?year=${year}`);
  const quarters = [1, 2, 3, 4].map((q) => ({ q, rows: (data ?? []).filter((r) => r.quarter === q) })).filter((g) => g.rows.length);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={COPY.FORECAST.TITLE} subtitle={COPY.FORECAST.SUBTITLE}>
        <Select fieldSize="sm" aria-label={COPY.FORECAST.YEAR} value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {[thisYear - 1, thisYear, thisYear + 1].map((y) => <option key={y} value={y}>{y}</option>)}
        </Select>
      </PageHeader>
      {error && <ErrorState message={error.message} onRetry={reload} retryLabel={COPY.COMMON.RETRY} />}
      {loading && !data && <LoadingTable rows={6} cols={6} />}
      {data && data.length === 0 && <EmptyState icon={TrendingUp} title={COPY.FORECAST.EMPTY} />}
      {data && data.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {KEYS.map((k) => <StatCard key={k} label={LABELS[k]} value={formatMoney(sum(data, k))} />)}
          </div>
          <Table containerClassName="rounded-card border border-line">
            <TableHead><TableRow>
              <TableHeader>{COPY.FORECAST.OWNER}</TableHeader>
              {KEYS.map((k) => <TableHeader key={k} numeric>{LABELS[k]}</TableHeader>)}
            </TableRow></TableHead>
            <TableBody>
              {quarters.flatMap(({ q, rows }) => [
                <TableRow key={`q${q}`} className="bg-surface-subtle">
                  <TableCell className="text-label">{COPY.FORECAST.QUARTER(q)}</TableCell>
                  {KEYS.map((k) => <TableCell key={k} numeric className="text-label">{formatMoney(sum(rows, k))}</TableCell>)}
                </TableRow>,
                ...rows.map((r) => (
                  <TableRow key={`${q}:${r.ownerId}`}>
                    <TableCell className="pl-8">{r.ownerName}</TableCell>
                    {KEYS.map((k) => <TableCell key={k} numeric>{formatMoney(r[k])}</TableCell>)}
                  </TableRow>
                )),
              ])}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}
