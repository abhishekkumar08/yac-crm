import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Alert, BackLink, Button, Card, CardContent, Disclosure, ErrorState, IconButton, Input, LoadingCard, PageHeader, Select,
  Spinner, Textarea, useNotifications,
} from "@kasumi/ui";
import { Plus, X } from "lucide-react";
import { api } from "@/api.js";
import { COPY } from "@/copy.js";
import { dangerConfirm } from "@/confirm.js";
import { useObjectMeta, useSession } from "@/hooks.js";
import { displayType } from "@/format.js";
import FilterPanel from "@/records/FilterPanel.jsx";
import ColumnPicker from "@/records/ColumnPicker.jsx";
import ReportChart from "@/insight/ReportChart.jsx";
import ReportTable from "@/insight/ReportTable.jsx";

import { NUMERIC_TYPES as NUMERIC } from "@shared/field-types.js";
const NEW_DEF = { object: "opportunity", filters: [], scope: "all", columns: ["name", "amount", "close_date"], groupBy: [], aggregates: [{ fn: "count" }], chart: "" };

function Builder({ def, setDef, meta, objects }) {
  const groupable = meta.fields.filter((f) => !["textarea", "multipicklist"].includes(f.type));
  const numeric = meta.fields.filter((f) => NUMERIC.has(displayType(f)));
  const setGroup = (i, v) => {
    const g = [...def.groupBy];
    if (v) g[i] = v; else g.splice(i);
    setDef({ ...def, groupBy: g.filter(Boolean) });
  };
  const setAgg = (i, patch) => setDef({ ...def, aggregates: def.aggregates.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-3">
        <Select label={COPY.REPORTS.OBJECT} value={def.object}
          onChange={(e) => setDef({ ...NEW_DEF, object: e.target.value, columns: ["name"], aggregates: [{ fn: "count" }] })}>
          {objects.map((o) => <option key={o.name} value={o.name}>{o.plural}</option>)}
        </Select>
        <Select label={COPY.REPORTS.SCOPE} value={def.scope} onChange={(e) => setDef({ ...def, scope: e.target.value })}>
          <option value="all">{COPY.LIST.SCOPE_ALL}</option><option value="mine">{COPY.LIST.SCOPE_MINE}</option>
        </Select>
        <Select label={COPY.REPORTS.CHART} value={def.chart ?? ""} onChange={(e) => setDef({ ...def, chart: e.target.value })} disabled={!def.groupBy.length}>
          <option value="">{COPY.REPORTS.CHART_NONE}</option>
          {Object.entries(COPY.REPORTS.CHART_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </div>
      <section>
        <h3 className="mb-2 text-label text-fg">{COPY.LIST.FILTERS}</h3>
        <FilterPanel fields={meta.fields} filters={def.filters} onChange={(filters) => setDef({ ...def, filters })} />
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        <Select label={COPY.REPORTS.GROUP_BY} value={def.groupBy[0] ?? ""} onChange={(e) => setGroup(0, e.target.value)}>
          <option value="">{COPY.COMMON.NONE}</option>
          {groupable.map((f) => <option key={f.name} value={f.name}>{f.label}</option>)}
        </Select>
        <Select label={COPY.REPORTS.GROUP_BY_2} value={def.groupBy[1] ?? ""} onChange={(e) => setGroup(1, e.target.value)} disabled={!def.groupBy[0]}>
          <option value="">{COPY.COMMON.NONE}</option>
          {groupable.filter((f) => f.name !== def.groupBy[0]).map((f) => <option key={f.name} value={f.name}>{f.label}</option>)}
        </Select>
      </div>
      <section className="flex flex-col gap-2">
        <h3 className="text-label text-fg">{COPY.REPORTS.SUMMARIES}</h3>
        {def.aggregates.map((a, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <Select fieldSize="sm" aria-label={COPY.REPORTS.SUMMARIES} value={a.fn} onChange={(e) => setAgg(i, { fn: e.target.value, field: e.target.value === "count" ? undefined : a.field ?? numeric[0]?.name })}>
              {Object.entries(COPY.REPORTS.FN).map(([k, v]) => <option key={k} value={k} disabled={k !== "count" && !numeric.length}>{v}</option>)}
            </Select>
            {a.fn !== "count" && (
              <Select fieldSize="sm" aria-label={COPY.LIST.FIELD} value={a.field ?? ""} onChange={(e) => setAgg(i, { field: e.target.value })}>
                {numeric.map((f) => <option key={f.name} value={f.name}>{f.label}</option>)}
              </Select>
            )}
            {def.aggregates.length > 1 && <IconButton icon={X} label={COPY.COMMON.REMOVE} variant="ghost" size="sm" onClick={() => setDef({ ...def, aggregates: def.aggregates.filter((_, j) => j !== i) })} />}
          </div>
        ))}
        <div>
          <Button size="sm" variant="secondary" disabled={!numeric.length}
            onClick={() => setDef({ ...def, aggregates: [...def.aggregates, { fn: "sum", field: numeric[0]?.name }] })}>
            <Plus aria-hidden="true" className="h-4 w-4" />{COPY.REPORTS.ADD_SUMMARY}
          </Button>
        </div>
      </section>
      {!def.groupBy.length && (
        <div><ColumnPicker fields={meta.fields} columns={def.columns} onChange={(columns) => setDef({ ...def, columns })} /></div>
      )}
    </div>
  );
}

export default function ReportPage() {
  const { id } = useParams();
  const isNew = id === "new";
  const navigate = useNavigate();
  const { notify, confirmAction } = useNotifications();
  const { objects, user, isAdmin } = useSession();
  const [report, setReport] = useState(isNew ? { name: "", description: "", def: NEW_DEF, ownerId: user.id } : null);
  const [loadError, setLoadError] = useState(null);
  const [result, setResult] = useState(null);
  const [runError, setRunError] = useState(null);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const { meta } = useObjectMeta(report?.def.object);
  const loadedDef = useRef(null);

  useEffect(() => {
    if (isNew) return undefined;
    let live = true;
    api(`/reports/${id}`).then(
      (r) => { if (live) { loadedDef.current = r.def; setReport(r); setResult(r.result); } },
      (err) => live && setLoadError(err),
    );
    return () => { live = false; };
  }, [id, isNew]);

  const def = report?.def;
  useEffect(() => {
    if (!def || def === loadedDef.current) return undefined;
    let live = true;
    const t = setTimeout(() => {
      setRunning(true);
      api("/reports/run", { method: "POST", body: def }).then(
        (res) => { if (live) { setResult(res); setRunError(null); setRunning(false); } },
        (err) => { if (live) { setRunError(err.message); setRunning(false); } },
      );
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [def]);

  if (loadError) return <ErrorState message={loadError.status === 404 ? COPY.COMMON.NOT_FOUND : loadError.message} />;
  if (!report || !meta) return <LoadingCard />;

  const canEdit = isNew || isAdmin || report.ownerId === user.id;
  const setDef = (next) => setReport({ ...report, def: next });

  const save = () => {
    setBusy(true);
    const body = { name: report.name, description: report.description, def: report.def };
    const req = isNew ? api("/reports", { method: "POST", body }) : api(`/reports/${id}`, { method: "PUT", body });
    req.then(
      (saved) => { setBusy(false); notify(COPY.REPORTS.SAVED, "success"); if (isNew) navigate(`/reports/${saved.id}`, { replace: true }); else setReport({ ...report, ...saved }); },
      (err) => { setBusy(false); notify(err.message, "error"); },
    );
  };
  const remove = async () => {
    if (!(await confirmAction(dangerConfirm(COPY.COMMON.DELETE, COPY.REPORTS.DELETE_CONFIRM(report.name))))) return;
    api(`/reports/${id}`, { method: "DELETE" }).then(() => { notify(COPY.REPORTS.DELETED, "success"); navigate("/reports"); }, (err) => notify(err.message, "error"));
  };

  return (
    <div className="flex flex-col gap-4">
      <BackLink as={Link} to="/reports">{COPY.REPORTS.TITLE}</BackLink>
      <PageHeader title={report.name || COPY.REPORTS.NEW} subtitle={meta.plural}
        action={canEdit ? <Button onClick={save} loading={busy} disabled={!report.name.trim()}>{COPY.REPORTS.SAVE}</Button> : undefined}>
        {running && <Spinner size="sm" />}
        {!isNew && canEdit && <Button variant="destructive" size="sm" onClick={remove}>{COPY.COMMON.DELETE}</Button>}
      </PageHeader>
      {canEdit && (
        <Disclosure variant="card" title={COPY.REPORTS.BUILDER} defaultOpen={isNew}>
          <div className="flex flex-col gap-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Input label={COPY.REPORTS.NAME} value={report.name} onChange={(e) => setReport({ ...report, name: e.target.value })} required />
              <Textarea label={COPY.REPORTS.DESCRIPTION} rows={1} value={report.description ?? ""} onChange={(e) => setReport({ ...report, description: e.target.value })} />
            </div>
            <Builder def={report.def} setDef={setDef} meta={meta} objects={objects} />
          </div>
        </Disclosure>
      )}
      {runError && <Alert tone="error">{runError}</Alert>}
      {result && (
        <>
          {result.truncated && <Alert tone="info">{COPY.REPORTS.TRUNCATED(result.rows.length)}</Alert>}
          {report.def.chart && report.def.groupBy.length > 0 && result.groups.length > 0 && (
            <Card><CardContent><ReportChart def={report.def} result={result} meta={meta} type={report.def.chart} /></CardContent></Card>
          )}
          <ReportTable def={report.def} result={result} meta={meta} />
        </>
      )}
    </div>
  );
}
