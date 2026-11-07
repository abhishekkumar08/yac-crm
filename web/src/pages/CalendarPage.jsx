import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, ErrorState, IconButton, PageHeader, SegmentedControl, Spinner, TextLink } from "@kasumi/ui";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { qs } from "@/api.js";
import { COPY } from "@/copy.js";
import { useApi, useObjectMeta } from "@/hooks.js";
import { formatTime, ymd } from "@/format.js";
import RecordModal from "@/records/RecordModal.jsx";

const MAX_PER_DAY = 3;
const monthLabel = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });

function gridDays(month) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

export default function CalendarPage() {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [scope, setScope] = useState("mine");
  const [newOn, setNewOn] = useState(null);
  const { meta } = useObjectMeta("event");
  const days = useMemo(() => gridDays(month), [month]);
  const from = ymd(days[0]);
  const to = ymd(days[days.length - 1]);
  const { data, error, loading, reload } = useApi(`/calendar${qs({ from, to, scope })}`);
  const byDay = useMemo(() => {
    const map = new Map();
    for (const e of data ?? []) {
      const key = ymd(new Date(e.start));
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    }
    return map;
  }, [data]);
  const today = ymd(new Date());
  const shift = (n) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const initial = newOn ? { start: new Date(`${newOn}T09:00`).toISOString(), end: new Date(`${newOn}T10:00`).toISOString() } : undefined;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={monthLabel.format(month)} eyebrow={COPY.CALENDAR.TITLE}
        action={<Button onClick={() => setNewOn(today)}><Plus aria-hidden="true" className="h-4 w-4" />{COPY.CALENDAR.NEW_EVENT}</Button>}>
        <IconButton icon={ChevronLeft} label={COPY.CALENDAR.PREV} variant="secondary" size="sm" onClick={() => shift(-1)} />
        <Button variant="secondary" size="sm" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>{COPY.CALENDAR.TODAY}</Button>
        <IconButton icon={ChevronRight} label={COPY.CALENDAR.NEXT} variant="secondary" size="sm" onClick={() => shift(1)} />
        <SegmentedControl label={COPY.CALENDAR.TITLE} value={scope} onChange={setScope}
          options={[{ value: "mine", label: COPY.CALENDAR.MINE }, { value: "all", label: COPY.CALENDAR.ALL }]} />
        {loading && <Spinner size="sm" />}
      </PageHeader>
      {error && <ErrorState message={error.message} onRetry={reload} retryLabel={COPY.COMMON.RETRY} />}
      <div className="relative overflow-x-auto">
        <div className="grid min-w-[720px] grid-cols-7 overflow-hidden rounded-card border border-line bg-surface">
          {COPY.CALENDAR.WEEKDAYS.map((d) => <div key={d} className="border-b border-line px-2 py-1.5 text-caption text-fg-muted">{d}</div>)}
          {days.map((d) => {
            const key = ymd(d);
            const events = byDay.get(key) ?? [];
            const inMonth = d.getMonth() === month.getMonth();
            return (
              <div key={key} className={`group min-h-28 border-b border-r border-line-muted p-1.5 ${inMonth ? "" : "bg-surface-subtle"}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-caption ${key === today ? "rounded-pill bg-accent px-1.5 text-fg-on-accent" : inMonth ? "text-fg" : "text-fg-muted"}`}>{d.getDate()}</span>
                  <IconButton icon={Plus} label={`${COPY.CALENDAR.NEW_EVENT} ${key}`} variant="ghost" size="xs"
                    className="opacity-0 focus:opacity-100 group-hover:opacity-100" onClick={() => setNewOn(key)} />
                </div>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {events.slice(0, MAX_PER_DAY).map((e) => (
                    <li key={e.id} className="truncate text-caption">
                      <TextLink as={Link} to={`/r/event/${e.id}`}>{e.all_day ? "" : `${formatTime(e.start)} `}{e.subject}</TextLink>
                    </li>
                  ))}
                  {events.length > MAX_PER_DAY && <li className="text-caption text-fg-muted">{COPY.CALENDAR.MORE(events.length - MAX_PER_DAY)}</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
      <RecordModal meta={meta} open={Boolean(newOn)} initial={initial} onClose={() => setNewOn(null)}
        onSaved={(_, { andNew }) => { if (!andNew) setNewOn(null); reload(); }} />
    </div>
  );
}
