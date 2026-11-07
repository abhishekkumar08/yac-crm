import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Alert, BackLink, Button, Card, CardContent, CardHeader, CardTitle, ErrorState, IconButton, Input, LoadingCard,
  PageHeader, Select, Stat, TextLink, useNotifications,
} from "@kasumi/ui";
import { ArrowDown, ArrowUp, Plus, RefreshCw, X } from "lucide-react";
import { api } from "@/api.js";
import { COPY } from "@/copy.js";
import { dangerConfirm } from "@/confirm.js";
import { useObjectMeta, useSession } from "@/hooks.js";
import { formatDateTime } from "@/format.js";
import ReportChart from "@/insight/ReportChart.jsx";
import ReportTable from "@/insight/ReportTable.jsx";
import { aggKey, aggLabel, formatterFor, primaryAggregate } from "@/insight/summary.js";

function Component({ c }) {
  const { meta } = useObjectMeta(c.report?.def.object);
  return (
    <Card className={c.type === "table" ? "md:col-span-2" : undefined}>
      <CardHeader className="flex flex-row items-center gap-2">
        <CardTitle as="h2">{c.title || c.report?.name}</CardTitle>
        {c.report && <TextLink as={Link} to={`/reports/${c.report.id}`} className="ml-auto text-caption">{COPY.DASHBOARDS.OPEN_REPORT}</TextLink>}
      </CardHeader>
      <CardContent>
        {c.error && <Alert tone="warning" variant="inline">{c.error}</Alert>}
        {!c.error && !meta && <LoadingCard />}
        {!c.error && meta && c.type === "metric" && (() => {
          const agg = primaryAggregate(c.report.def);
          return <Stat label={aggLabel(agg, meta)} value={formatterFor(agg, meta)(c.result.totals[aggKey(agg)] ?? 0)} />;
        })()}
        {!c.error && meta && c.type === "table" && <ReportTable def={c.report.def} result={c.result} meta={meta} />}
        {!c.error && meta && !["metric", "table"].includes(c.type) && (
          c.result.groups.length ? <ReportChart def={c.report.def} result={c.result} meta={meta} type={c.type} height={240} />
            : <p className="text-body text-fg-muted">{COPY.REPORTS.NO_ROWS}</p>
        )}
      </CardContent>
    </Card>
  );
}

function Editor({ draft, setDraft, reports }) {
  const set = (i, patch) => setDraft({ ...draft, components: draft.components.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const move = (i, d) => {
    const list = [...draft.components];
    [list[i], list[i + d]] = [list[i + d], list[i]];
    setDraft({ ...draft, components: list });
  };
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Input label={COPY.DASHBOARDS.NAME} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />
          <Input label={COPY.REPORTS.DESCRIPTION} value={draft.description ?? ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        </div>
        {reports.length === 0 && <Alert tone="info">{COPY.DASHBOARDS.NO_REPORTS}</Alert>}
        {draft.components.map((c, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2 rounded-control border border-line p-3">
            <div className="min-w-48 flex-1"><Select label={COPY.DASHBOARDS.REPORT} value={c.reportId} onChange={(e) => set(i, { reportId: e.target.value })}>
              {reports.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select></div>
            <Select label={COPY.DASHBOARDS.TYPE} value={c.type} onChange={(e) => set(i, { type: e.target.value })}>
              {Object.entries(COPY.DASHBOARDS.TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <div className="min-w-48 flex-1"><Input label={COPY.DASHBOARDS.COMPONENT_TITLE} value={c.title ?? ""} onChange={(e) => set(i, { title: e.target.value })} /></div>
            <IconButton icon={ArrowUp} label={COPY.SETUP.MOVE_UP} variant="ghost" size="sm" disabled={i === 0} onClick={() => move(i, -1)} />
            <IconButton icon={ArrowDown} label={COPY.SETUP.MOVE_DOWN} variant="ghost" size="sm" disabled={i === draft.components.length - 1} onClick={() => move(i, 1)} />
            <IconButton icon={X} label={COPY.COMMON.REMOVE} variant="ghost" size="sm" onClick={() => setDraft({ ...draft, components: draft.components.filter((_, j) => j !== i) })} />
          </div>
        ))}
        <div>
          <Button size="sm" variant="secondary" disabled={!reports.length}
            onClick={() => setDraft({ ...draft, components: [...draft.components, { reportId: reports[0].id, type: "bar", title: "" }] })}>
            <Plus aria-hidden="true" className="h-4 w-4" />{COPY.DASHBOARDS.ADD_COMPONENT}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { id } = useParams();
  const isNew = id === "new";
  const navigate = useNavigate();
  const { notify, confirmAction } = useNotifications();
  const { user, isAdmin } = useSession();
  const [dash, setDash] = useState(null);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState(isNew ? { name: "", description: "", components: [] } : null);
  const [reports, setReports] = useState([]);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [loadedAt, setLoadedAt] = useState(null);

  useEffect(() => {
    if (isNew) return undefined;
    let live = true;
    api(`/dashboards/${id}`).then((d) => { if (live) { setDash(d); setLoadedAt(new Date().toISOString()); } }, (err) => live && setError(err));
    return () => { live = false; };
  }, [id, isNew, tick]);
  const editing = draft !== null;
  useEffect(() => { if (editing) api("/reports").then(setReports, (err) => notify(err.message, "error")); }, [editing, notify]);

  if (error) return <ErrorState message={error.status === 404 ? COPY.COMMON.NOT_FOUND : error.message} />;
  if (!isNew && !dash) return <LoadingCard />;
  const canEdit = isNew || isAdmin || dash.ownerId === user.id;

  const save = () => {
    setBusy(true);
    const body = { name: draft.name, description: draft.description, components: draft.components.map(({ reportId, type, title }) => ({ reportId, type, title })) };
    const req = isNew ? api("/dashboards", { method: "POST", body }) : api(`/dashboards/${id}`, { method: "PUT", body });
    req.then(
      (saved) => { setBusy(false); setDraft(null); notify(COPY.DASHBOARDS.SAVED, "success"); if (isNew) navigate(`/dashboards/${saved.id}`, { replace: true }); else setTick((t) => t + 1); },
      (err) => { setBusy(false); notify(err.message, "error"); },
    );
  };
  const remove = async () => {
    if (!(await confirmAction(dangerConfirm(COPY.COMMON.DELETE, COPY.DASHBOARDS.DELETE_CONFIRM(dash.name))))) return;
    api(`/dashboards/${id}`, { method: "DELETE" }).then(() => { notify(COPY.DASHBOARDS.DELETED, "success"); navigate("/dashboards"); }, (err) => notify(err.message, "error"));
  };

  return (
    <div className="flex flex-col gap-4">
      <BackLink as={Link} to="/dashboards">{COPY.DASHBOARDS.TITLE}</BackLink>
      <PageHeader title={draft ? draft.name || COPY.DASHBOARDS.NEW : dash.name}
        subtitle={!draft && loadedAt ? COPY.DASHBOARDS.AS_OF(formatDateTime(loadedAt)) : undefined}
        action={draft
          ? <Button onClick={save} loading={busy} disabled={!draft.name.trim()}>{COPY.COMMON.SAVE}</Button>
          : canEdit ? <Button variant="secondary" onClick={() => setDraft({ name: dash.name, description: dash.description, components: dash.components.map(({ reportId, type, title }) => ({ reportId, type, title })) })}>{COPY.COMMON.EDIT}</Button> : undefined}>
        {!draft && <IconButton icon={RefreshCw} label={COPY.DASHBOARDS.REFRESH} variant="secondary" size="sm" onClick={() => setTick((t) => t + 1)} />}
        {draft && !isNew && <Button variant="secondary" size="sm" onClick={() => setDraft(null)}>{COPY.COMMON.CANCEL}</Button>}
        {!draft && canEdit && <Button variant="destructive" size="sm" onClick={remove}>{COPY.COMMON.DELETE}</Button>}
      </PageHeader>
      {draft && <Editor draft={draft} setDraft={setDraft} reports={reports} />}
      {!draft && dash && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {dash.components.map((c, i) => <Component key={i} c={c} />)}
        </div>
      )}
    </div>
  );
}
