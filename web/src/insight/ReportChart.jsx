import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarGraph, ChartTooltip, DonutGraph, useChartTheme } from "@kasumi/ui";
import { aggKey, aggLabel, formatterFor, primaryAggregate } from "@/insight/summary.js";

export default function ReportChart({ def, result, meta, type, height = 280 }) {
  const chart = useChartTheme();
  const agg = primaryAggregate(def);
  const key = aggKey(agg);
  const data = result.groups.map((g) => ({ label: g.label, value: g.values[key] ?? 0 }));
  const fmt = formatterFor(agg, meta);
  const short = formatterFor(agg, meta, true);
  if (!data.length) return null;
  if (type === "pie" || type === "donut") {
    return <DonutGraph data={data} nameKey="label" valueKey="value" height={height} valueFormatter={fmt} />;
  }
  if (type === "line") {
    return (
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke={chart.grid} vertical={false} />
            <XAxis dataKey="label" stroke={chart.axis} fontSize={12} />
            <YAxis tickFormatter={short} stroke={chart.axis} fontSize={12} width={64} />
            <Tooltip content={<ChartTooltip formatter={(v) => fmt(v)} />} cursor={{ stroke: chart.cursor }} />
            <Line type="monotone" dataKey="value" name={aggLabel(agg, meta)} stroke={chart.colors[0]} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }
  return (
    <BarGraph data={data} categoryKey="label" series={[{ key: "value", label: aggLabel(agg, meta) }]}
      layout={type === "bar" ? "vertical" : "horizontal"} height={type === "bar" ? undefined : height}
      valueFormatter={short} tooltipFormatter={fmt} />
  );
}
