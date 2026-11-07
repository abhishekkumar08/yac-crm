import { Link } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Card, CardContent, CardHeader, CardTitle, ChartTooltip, Checkbox, ErrorState, List, ListRow, LoadingCard, PageHeader,
  StatCard, TextLink, useChartTheme, useNotifications,
} from "@kasumi/ui";
import { CalendarDays, CircleDollarSign, Clock } from "lucide-react";
import { api } from "@/api.js";
import { COPY } from "@/copy.js";
import { useApi, useSession } from "@/hooks.js";
import { formatDate, formatMoney, formatMoneyShort, formatTime, ymd } from "@/format.js";
import { objectIcon } from "@/icons.js";

function cumulative(deals, from, to) {
  const byDay = new Map();
  for (const d of deals) byDay.set(d.close_date, (byDay.get(d.close_date) ?? 0) + Number(d.amount));
  const out = [];
  let total = 0;
  const last = ymd(new Date()) < to ? ymd(new Date()) : to;
  for (let d = new Date(`${from}T00:00:00`); ymd(d) <= last; d.setDate(d.getDate() + 7)) {
    const end = new Date(d); end.setDate(end.getDate() + 6);
    for (const [day, amount] of byDay) if (day >= ymd(d) && day <= ymd(end)) total += amount;
    out.push({ week: ymd(d), total });
  }
  return out;
}

export default function Home() {
  const { user, objects } = useSession();
  const { notify } = useNotifications();
  const chart = useChartTheme();
  const { data, error, loading, reload } = useApi("/home");
  const approvals = useApi("/approvals/pending");
  const iconFor = (name) => objectIcon(objects.find((o) => o.name === name)?.icon);

  if (error) return <ErrorState message={error.message} onRetry={reload} retryLabel={COPY.COMMON.RETRY} />;
  const complete = (task) => api(`/records/task/${task.id}`, { method: "PATCH", body: { status: "Completed" } })
    .then(() => { notify(COPY.HOME.DONE, "success"); reload(); }, (err) => notify(err.message, "error"));
  const today = ymd(new Date());

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={COPY.HOME.GREETING(user.name.split(" ")[0])} />
      {loading && !data ? <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-3"><LoadingCard /><LoadingCard /><LoadingCard /></div> : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle as="h2">{COPY.HOME.QUARTER}</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <StatCard label={COPY.HOME.CLOSED} value={formatMoney(data.quarter.closedWon)} icon={CircleDollarSign} iconTone="success" />
                <StatCard label={COPY.HOME.OPEN_PIPELINE} value={formatMoney(data.quarter.open)} icon={Clock} iconTone="info" />
              </div>
              <div className="h-56" role="img" aria-label={COPY.HOME.CUMULATIVE}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={cumulative(data.quarter.closedWonDeals, data.quarter.from, data.quarter.to)}>
                    <CartesianGrid stroke={chart.grid} vertical={false} />
                    <XAxis dataKey="week" tickFormatter={formatDate} stroke={chart.axis} fontSize={12} />
                    <YAxis tickFormatter={formatMoneyShort} stroke={chart.axis} fontSize={12} width={64} />
                    <Tooltip content={<ChartTooltip formatter={(v) => formatMoney(v)} labelFormatter={formatDate} />} cursor={{ stroke: chart.cursor }} />
                    <Area type="monotone" dataKey="total" name={COPY.HOME.CLOSED} stroke={chart.colors[0]} fill={chart.colors[0]} fillOpacity={0.15} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle as="h2">{COPY.HOME.ASSISTANT}</CardTitle></CardHeader>
            <CardContent>
              {data.assistant.length === 0 ? <p className="text-body text-fg-muted">{COPY.HOME.ASSISTANT_EMPTY}</p> : (
                <ul className="flex flex-col gap-3">
                  {data.assistant.map((a) => (
                    <li key={a.kind}>
                      <p className="text-label text-fg">{COPY.HOME.ASSIST[a.kind](a.count)}</p>
                      <ul className="mt-1 text-caption">
                        {a.records.map((r) => <li key={r.id}><TextLink as={Link} to={`/r/${r.object}/${r.id}`}>{r.name}</TextLink></li>)}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          {approvals.data?.length > 0 && (
            <Card className="lg:col-span-3">
              <CardHeader><CardTitle as="h2">{COPY.APPROVAL.ITEMS}</CardTitle></CardHeader>
              <CardContent>
                <List>
                  {approvals.data.map((a) => (
                    <ListRow key={a.id} title={<TextLink as={Link} to={`/r/${a.object}/${a.recordId}`}>{a.recordName}</TextLink>}
                      description={COPY.APPROVAL.FROM(a.submittedByName ?? "")} meta={formatDate(a.submittedAt)} />
                  ))}
                </List>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader><CardTitle as="h2">{COPY.HOME.TASKS}</CardTitle></CardHeader>
            <CardContent>
              {data.tasks.length === 0 ? <p className="text-body text-fg-muted">{COPY.HOME.TASKS_EMPTY}</p> : (
                <List>
                  {data.tasks.map((t) => (
                    <ListRow key={t.id}
                      leading={<Checkbox aria-label={COPY.HOME.MARK_DONE} checked={false} onChange={() => complete(t)} />}
                      title={<TextLink as={Link} to={`/r/task/${t.id}`}>{t.subject}</TextLink>}
                      description={t.$names?.what ?? t.$names?.who ?? undefined}
                      meta={<span className={t.due_date < today ? "text-error-fg" : undefined}>{t.due_date < today ? `${COPY.HOME.OVERDUE} · ` : ""}{formatDate(t.due_date)}</span>} />
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle as="h2">{COPY.HOME.EVENTS}</CardTitle></CardHeader>
            <CardContent>
              {data.events.length === 0 ? <p className="text-body text-fg-muted">{COPY.HOME.EVENTS_EMPTY}</p> : (
                <List>
                  {data.events.map((e) => (
                    <ListRow key={e.id} leading={<CalendarDays aria-hidden="true" className="h-4 w-4 text-fg-muted" />}
                      title={<TextLink as={Link} to={`/r/event/${e.id}`}>{e.subject}</TextLink>}
                      description={e.location ?? undefined} meta={`${formatTime(e.start)}–${formatTime(e.end)}`} />
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle as="h2">{COPY.HOME.KEY_DEALS}</CardTitle></CardHeader>
            <CardContent>
              {data.keyDeals.length === 0 ? <p className="text-body text-fg-muted">{COPY.HOME.KEY_DEALS_EMPTY}</p> : (
                <List>
                  {data.keyDeals.map((o) => (
                    <ListRow key={o.id} title={<TextLink as={Link} to={`/r/opportunity/${o.id}`}>{o.name}</TextLink>}
                      description={o.$names?.account ?? undefined} meta={`${formatMoney(o.amount)} · ${o.stage}`} />
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
          <Card className="lg:col-span-3">
            <CardHeader><CardTitle as="h2">{COPY.HOME.RECENT}</CardTitle></CardHeader>
            <CardContent>
              {data.recent.length === 0 ? <p className="text-body text-fg-muted">{COPY.HOME.RECENT_EMPTY}</p> : (
                <List>
                  {data.recent.map((r) => {
                    const Icon = iconFor(r.object);
                    return <ListRow key={r.id} leading={<Icon aria-hidden="true" className="h-4 w-4 text-fg-muted" />}
                      title={<TextLink as={Link} to={`/r/${r.object}/${r.id}`}>{r.name || r.id}</TextLink>}
                      meta={objects.find((o) => o.name === r.object)?.label} />;
                  })}
                </List>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
