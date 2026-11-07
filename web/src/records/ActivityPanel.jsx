import { useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Checkbox, ErrorState, Input, List, ListRow, LoadingCard, Tabs, Textarea, TextLink, useNotifications } from "@kasumi/ui";
import { CalendarDays, CheckSquare, Mail, Phone, StickyNote } from "lucide-react";
import { api } from "@/api.js";
import { COPY } from "@/copy.js";
import { useApi } from "@/hooks.js";
import EmailComposer from "@/records/EmailComposer.jsx";
import { formatDate, formatDateTime, ymd } from "@/format.js";

const PEOPLE = new Set(["contact", "lead"]);
const ICON = { task: CheckSquare, event: CalendarDays, note: StickyNote };

function linkFor(record) {
  return PEOPLE.has(record.object) ? { who: record.id } : { what: record.id, ...(record.contact ? { who: record.contact } : {}) };
}

function Composer({ kind, record, onSaved }) {
  const { notify } = useNotifications();
  const [subject, setSubject] = useState(kind === "call" ? COPY.ACTIVITY.CALL_SUBJECT : "");
  const [due, setDue] = useState(kind === "task" ? ymd(new Date()) : "");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [body, setBody] = useState("");
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const payload = () => {
    const link = linkFor(record);
    if (kind === "task") return ["task", { subject, due_date: due || null, description: body || null, ...link }];
    if (kind === "call") return ["task", { subject, type: "Call", status: "Completed", due_date: ymd(new Date()), description: body || null, ...link }];
    if (kind === "event") return ["event", { subject, start: start ? new Date(start).toISOString() : null, end: end ? new Date(end).toISOString() : null, description: body || null, ...link }];
    return ["note", { title: subject, body: body || null, what: record.id }];
  };

  const save = (e) => {
    e.preventDefault();
    const [object, values] = payload();
    setBusy(true);
    api(`/records/${object}`, { method: "POST", body: values }).then(
      () => { setBusy(false); setErrors({}); setSubject(""); setBody(""); notify(COPY.ACTIVITY.LOGGED, "success"); onSaved(); },
      (err) => { setBusy(false); setErrors(err.fields ?? {}); notify(err.fields ? COPY.RECORD.FIX_ERRORS : err.message, "error"); },
    );
  };

  const subjectError = errors.subject ?? errors.title;
  return (
    <form onSubmit={save} className="flex flex-col gap-3 pt-3" noValidate>
      <Input label={kind === "note" ? COPY.ACTIVITY.TITLE : COPY.ACTIVITY.SUBJECT} value={subject} onChange={(e) => setSubject(e.target.value)} required error={subjectError} />
      {kind === "task" && <Input label={COPY.ACTIVITY.DUE} type="date" value={due} onChange={(e) => setDue(e.target.value)} error={errors.due_date} />}
      {kind === "event" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label={COPY.ACTIVITY.START} type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required error={errors.start} />
          <Input label={COPY.ACTIVITY.END} type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} required error={errors.end} />
        </div>
      )}
      <Textarea label={kind === "note" ? COPY.ACTIVITY.BODY : COPY.ACTIVITY.COMMENTS} rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
      {errors._record && <Alert tone="error" variant="inline">{errors._record}</Alert>}
      <div className="flex justify-end"><Button type="submit" size="sm" loading={busy}>{COPY.COMMON.SAVE}</Button></div>
    </form>
  );
}

function TimelineItem({ item, onComplete }) {
  const Icon = item.object === "task" && item.type === "Call" ? Phone : item.object === "task" && item.type === "Email" ? Mail : ICON[item.object];
  const today = ymd(new Date());
  const overdue = item.object === "task" && item.status !== "Completed" && item.due_date && item.due_date < today;
  const when = item.object === "event" ? formatDateTime(item.start) : item.object === "task" ? (item.due_date ? COPY.ACTIVITY.DUE_ON(formatDate(item.due_date)) : "") : formatDateTime(item.createdAt);
  return (
    <ListRow
      leading={item.object === "task"
        ? <Checkbox aria-label={COPY.ACTIVITY.COMPLETE} checked={item.status === "Completed"} disabled={item.status === "Completed"} onChange={() => onComplete(item)} />
        : <Icon aria-hidden="true" className="h-4 w-4 text-fg-muted" />}
      title={<TextLink as={Link} to={`/r/${item.object}/${item.id}`}>{item.name}</TextLink>}
      description={item.description ?? item.body ?? undefined}
      meta={<span className={overdue ? "text-error-fg" : undefined}>{overdue ? `${COPY.ACTIVITY.OVERDUE} · ${when}` : when}</span>} />
  );
}

export default function ActivityPanel({ record, version, onChanged }) {
  const { notify } = useNotifications();
  const { data, error, loading, reload } = useApi(`/records/${record.object}/${record.id}/timeline?v=${version}`);
  const refresh = () => { reload(); onChanged?.(); };
  const complete = (task) => api(`/records/task/${task.id}`, { method: "PATCH", body: { status: "Completed" } })
    .then(() => { notify(COPY.HOME.DONE, "success"); refresh(); }, (err) => notify(err.message, "error"));
  const today = ymd(new Date());
  const items = data ?? [];
  const upcoming = items.filter((i) => (i.object === "task" && i.status !== "Completed") || (i.object === "event" && i.start?.slice(0, 10) >= today));
  const past = items.filter((i) => !upcoming.includes(i));
  const tabs = [
    ...[["task", COPY.ACTIVITY.NEW_TASK], ["call", COPY.ACTIVITY.LOG_CALL], ["event", COPY.ACTIVITY.NEW_EVENT]]
      .map(([id, label]) => ({ id, label, content: <Composer kind={id} record={record} onSaved={refresh} /> })),
    { id: "email", label: COPY.ACTIVITY.EMAIL, content: <EmailComposer record={record} onSent={refresh} /> },
    { id: "note", label: COPY.ACTIVITY.NEW_NOTE, content: <Composer kind="note" record={record} onSaved={refresh} /> },
  ];

  return (
    <Card>
      <CardHeader><CardTitle as="h2">{COPY.RECORD.ACTIVITY}</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Tabs variant="underline" tabs={tabs} defaultValue="task" />
        {error && <ErrorState message={error.message} onRetry={reload} retryLabel={COPY.COMMON.RETRY} />}
        {loading && !data && <LoadingCard />}
        {data && items.length === 0 && <p className="text-body text-fg-muted">{COPY.ACTIVITY.EMPTY}</p>}
        {upcoming.length > 0 && (
          <section>
            <h3 className="mb-1 text-label text-fg">{COPY.ACTIVITY.UPCOMING}</h3>
            <List>{upcoming.map((i) => <TimelineItem key={i.id} item={i} onComplete={complete} />)}</List>
          </section>
        )}
        {past.length > 0 && (
          <section>
            <h3 className="mb-1 text-label text-fg">{COPY.ACTIVITY.PAST}</h3>
            <List>{past.map((i) => <TimelineItem key={i.id} item={i} onComplete={complete} />)}</List>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
