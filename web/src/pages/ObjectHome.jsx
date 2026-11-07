import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Alert, Badge, Button, Disclosure, EmptyState, ErrorState, Input, LoadingTable, Menu, PageHeader, Pagination,
  SegmentedControl, Select, useNotifications,
} from "@kasumi/ui";
import { ChevronDown, Download, Filter, KanbanSquare, Plus, Search, Table2, Upload } from "lucide-react";
import { api, qs } from "@/api.js";
import { COPY } from "@/copy.js";
import { dangerConfirm } from "@/confirm.js";
import { invalidateMeta, useObjectMeta, useSession } from "@/hooks.js";
import { objectIcon } from "@/icons.js";
import ListTable from "@/records/ListTable.jsx";
import Kanban from "@/records/Kanban.jsx";
import FilterPanel from "@/records/FilterPanel.jsx";
import ColumnPicker from "@/records/ColumnPicker.jsx";
import RecordModal from "@/records/RecordModal.jsx";
import OwnerModal from "@/records/OwnerModal.jsx";
import MassActionModal from "@/records/MassActionModal.jsx";
import ImportModal from "@/records/ImportModal.jsx";
import ViewModal from "@/records/ViewModal.jsx";

const PAGE_SIZE = 50;
const KANBAN_LIMIT = 500;

function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function ObjectHome() {
  const { object } = useParams();
  const { meta, error: metaError } = useObjectMeta(object);
  if (metaError) return <ErrorState message={metaError.message} />;
  if (!meta) return <LoadingTable rows={8} cols={5} />;
  return <ObjectList key={object} meta={meta} />;
}

function ObjectList({ meta }) {
  const navigate = useNavigate();
  const { notify, confirmAction } = useNotifications();
  const { user, isAdmin } = useSession();
  const [params, setParams] = useSearchParams();
  const views = meta.views;
  const view = views.find((v) => v.id === params.get("view")) ?? views[0];
  const mode = params.get("mode") === "kanban" ? "kanban" : "table";

  const [draft, setDraft] = useState(null);
  const [search, setSearch] = useState(() => params.get("q") ?? "");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(new Set());
  const [data, setData] = useState({ records: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [tick, setTick] = useState(0);
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const q = useDebounced(search, 250);

  const current = draft ?? view;
  const dirty = draft !== null;
  const kanbanField = current.kanbanField ?? meta.pathField ?? meta.fields.find((f) => f.type === "picklist")?.name ?? null;
  const editableView = view.ownerId ? view.ownerId === user.id || isAdmin : isAdmin;
  const Icon = objectIcon(meta.icon);

  const urlFilter = params.get("f");
  useEffect(() => {
    let extra = [];
    try { extra = urlFilter ? JSON.parse(urlFilter) : []; } catch { extra = []; }
    setDraft(Array.isArray(extra) && extra.length ? { ...view, filters: [...view.filters, ...extra] } : null);
    setPage(1);
    setSelected(new Set());
  }, [view, urlFilter]);
  useEffect(() => { setPage(1); }, [q, draft]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    const limit = mode === "kanban" ? KANBAN_LIMIT : PAGE_SIZE;
    api(`/records/${meta.name}${qs({
      filters: current.filters, scope: current.scope, sort: current.sort ? `${current.sort.field}:${current.sort.dir}` : undefined,
      q, limit, offset: mode === "kanban" ? 0 : (page - 1) * PAGE_SIZE,
    })}`).then(
      (res) => { if (live) { setData(res); setLoading(false); setLoadError(null); } },
      (err) => { if (live) { setLoadError(err); setLoading(false); } },
    );
    return () => { live = false; };
  }, [meta.name, current, q, page, mode, tick]);

  const reload = () => setTick((t) => t + 1);
  const edit = (patch) => setDraft({ ...current, ...patch });
  const replaceRecord = (rec) => setData((d) => ({ ...d, records: d.records.map((r) => (r.id === rec.id ? rec : r)) }));
  const setMode = (m) => { const next = new URLSearchParams(params); if (m === "kanban") next.set("mode", "kanban"); else next.delete("mode"); setParams(next); };
  const selectView = (id) => { const next = new URLSearchParams(params); next.set("view", id); setParams(next); };

  const saveView = ({ name, shared }, asNew) => {
    setBusy(true);
    const body = { object: meta.name, name, shared, scope: current.scope, filters: current.filters, columns: current.columns, sort: current.sort, kanbanField: current.kanbanField };
    const req = asNew ? api("/meta/views", { method: "POST", body }) : api(`/meta/views/${view.id}`, { method: "PATCH", body });
    req.then(
      (saved) => { setBusy(false); setModal(null); invalidateMeta(); notify(COPY.LIST.VIEW_SAVED, "success"); setDraft(null); selectView(saved.id); },
      (err) => { setBusy(false); notify(err.message, "error"); },
    );
  };

  const deleteView = async () => {
    if (!(await confirmAction(dangerConfirm(COPY.LIST.DELETE_VIEW, view.name)))) return;
    api(`/meta/views/${view.id}`, { method: "DELETE" }).then(
      () => { invalidateMeta(); notify(COPY.LIST.VIEW_DELETED, "success"); setParams(new URLSearchParams()); },
      (err) => notify(err.message, "error"),
    );
  };

  const deleteRecords = async (ids) => {
    if (!(await confirmAction(dangerConfirm(COPY.COMMON.DELETE, COPY.LIST.CONFIRM_DELETE(ids.length))))) return;
    runMass({ ids, action: "delete" });
  };

  const runMass = (body) => {
    setBusy(true);
    api(`/records/${meta.name}/mass`, { method: "POST", body }).then(
      (res) => {
        setBusy(false);
        setModal(null);
        notify(COPY.LIST.MASS_DONE(res.ok.length, res.failed.length, res.failed[0]?.error), res.failed.length ? "warning" : "success");
        setSelected(new Set());
        reload();
      },
      (err) => { setBusy(false); notify(err.message, "error"); },
    );
  };
  const canStatus = meta.name === "lead";
  const canCampaign = meta.name === "lead" || meta.name === "contact";

  const fields = meta.fields;
  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const viewMenu = [
    { label: COPY.LIST.SAVE_AS, onSelect: () => setModal({ type: "saveAs" }) },
    ...(editableView ? [
      { label: COPY.LIST.RENAME, onSelect: () => setModal({ type: "rename" }) },
      { label: COPY.LIST.DELETE_VIEW, tone: "danger", onSelect: deleteView },
    ] : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow={meta.plural} title={
        <span className="flex items-center gap-2">
          <Icon aria-hidden="true" className="h-6 w-6 text-fg-muted" />
          <Select fieldSize="sm" aria-label={COPY.LIST.VIEW} value={view.id} onChange={(e) => selectView(e.target.value)} className="text-title">
            {views.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </Select>
        </span>
      } action={<Button onClick={() => setModal({ type: "new" })}><Plus aria-hidden="true" className="h-4 w-4" />{COPY.COMMON.NEW}</Button>}>
        <Button variant="secondary" size="sm" onClick={() => setModal({ type: "import" })}><Upload aria-hidden="true" className="h-4 w-4" />{COPY.LIST.IMPORT}</Button>
        <Button variant="secondary" size="sm" as="a" href={`/api/export/${meta.name}${qs({ filters: current.filters, scope: current.scope, q })}`}>
          <Download aria-hidden="true" className="h-4 w-4" />{COPY.LIST.EXPORT}
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-64"><Input fieldSize="sm" aria-label={COPY.LIST.SEARCH_LIST} placeholder={COPY.LIST.SEARCH_LIST}
          leading={<Search aria-hidden="true" className="h-4 w-4" />} value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <span className="text-caption text-fg-muted">{loading ? COPY.COMMON.LOADING : COPY.COMMON.ITEMS(data.total)}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select fieldSize="sm" aria-label={COPY.LIST.SCOPE} value={current.scope} onChange={(e) => edit({ scope: e.target.value })}>
            <option value="all">{COPY.LIST.SCOPE_ALL}</option>
            <option value="mine">{COPY.LIST.SCOPE_MINE}</option>
          </Select>
          {mode === "table" && <ColumnPicker fields={fields} columns={current.columns} onChange={(columns) => edit({ columns })} />}
          {mode === "kanban" && kanbanField && (
            <Select fieldSize="sm" aria-label={COPY.LIST.KANBAN_GROUP} value={kanbanField} onChange={(e) => edit({ kanbanField: e.target.value })}>
              {fields.filter((f) => f.type === "picklist").map((f) => <option key={f.name} value={f.name}>{f.label}</option>)}
            </Select>
          )}
          <SegmentedControl label={COPY.LIST.DISPLAY} value={mode} onChange={setMode}
            options={[{ value: "table", label: COPY.LIST.TABLE, icon: Table2 }, { value: "kanban", label: COPY.LIST.KANBAN, icon: KanbanSquare }]} />
          <Menu label={COPY.LIST.VIEW} align="end" items={viewMenu}
            trigger={<Button variant="secondary" size="sm">{COPY.LIST.VIEW}<ChevronDown aria-hidden="true" className="h-4 w-4" /></Button>} />
        </div>
      </div>

      <Disclosure variant="card" title={COPY.LIST.FILTERS} leading={<Filter aria-hidden="true" className="h-4 w-4" />}
        meta={current.filters.length ? <Badge size="count">{current.filters.length}</Badge> : null}>
        <FilterPanel fields={fields} filters={current.filters} onChange={(filters) => edit({ filters })} />
      </Disclosure>

      {dirty && (
        <Alert tone="info" action={
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setDraft(null)}>{COPY.COMMON.CANCEL}</Button>
            {editableView && <Button size="sm" variant="secondary" onClick={() => saveView({ name: view.name, shared: view.shared }, false)} loading={busy}>{COPY.COMMON.SAVE}</Button>}
            <Button size="sm" onClick={() => setModal({ type: "saveAs" })}>{COPY.LIST.SAVE_AS}</Button>
          </div>
        }>{COPY.LIST.SAVE_VIEW}</Alert>
      )}

      {selected.size > 0 && (
        <div className="flex items-center gap-2 rounded-card border border-line bg-surface px-3 py-2">
          <span className="text-label text-fg">{COPY.LIST.SELECTED(selected.size)}</span>
          {canStatus && <Button size="sm" variant="secondary" className="ml-auto" onClick={() => setModal({ type: "status", ids: [...selected] })}>{COPY.LIST.MASS_STATUS}</Button>}
          {canCampaign && <Button size="sm" variant="secondary" className={canStatus ? undefined : "ml-auto"} onClick={() => setModal({ type: "campaign", ids: [...selected] })}>{COPY.LIST.MASS_CAMPAIGN}</Button>}
          <Button size="sm" variant="secondary" className={canCampaign ? undefined : "ml-auto"} onClick={() => setModal({ type: "owner", ids: [...selected] })}>{COPY.LIST.MASS_OWNER}</Button>
          <Button size="sm" variant="destructive" onClick={() => deleteRecords([...selected])}>{COPY.LIST.MASS_DELETE}</Button>
        </div>
      )}

      {loadError && <ErrorState message={loadError.message} onRetry={reload} retryLabel={COPY.COMMON.RETRY} />}
      {!loadError && loading && data.records.length === 0 && <LoadingTable rows={8} cols={Math.max(3, current.columns.length)} />}
      {!loadError && !(loading && data.records.length === 0) && mode === "table" && (
        <>
          <ListTable meta={meta} records={data.records} columns={current.columns.length ? current.columns : [meta.fields[0].name]}
            sort={current.sort} onSort={(sort) => edit({ sort })} selected={selected} onSelect={setSelected}
            onRowSaved={replaceRecord} onEdit={(r) => setModal({ type: "edit", record: r })}
            onDelete={(r) => deleteRecords([r.id])} onOwner={(r) => setModal({ type: "owner", ids: [r.id], ownerId: r.ownerId })} />
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage}
            summary={COPY.LIST.SUMMARY(data.records.length, data.total)} />
        </>
      )}
      {!loadError && mode === "kanban" && (kanbanField
        ? <>
          {data.total > KANBAN_LIMIT && <Alert tone="info">{COPY.LIST.KANBAN_LIMIT(KANBAN_LIMIT)}</Alert>}
          <Kanban meta={meta} records={data.records} groupField={kanbanField} onMoved={replaceRecord} />
        </>
        : <EmptyState title={COPY.LIST.KANBAN_NO_PICKLIST} />)}

      <RecordModal meta={meta} open={modal?.type === "new" || modal?.type === "edit"} record={modal?.type === "edit" ? modal.record : undefined}
        onClose={() => setModal(null)}
        onSaved={(saved, { andNew }) => {
          if (modal?.type === "edit") { replaceRecord(saved); setModal(null); return; }
          if (!andNew) navigate(`/r/${meta.name}/${saved.id}`); else reload();
        }} />
      <OwnerModal open={modal?.type === "owner"} busy={busy} currentOwnerId={modal?.ownerId} onClose={() => setModal(null)}
        onConfirm={(ownerId) => runMass({ ids: modal.ids, action: "owner", ownerId })} />
      <MassActionModal meta={meta} kind={modal?.type === "status" ? "status" : "campaign"} busy={busy}
        open={modal?.type === "status" || modal?.type === "campaign"} onClose={() => setModal(null)}
        onConfirm={(body) => runMass({ ...body, ids: modal.ids })} />
      <ImportModal meta={meta} open={modal?.type === "import"} onClose={() => setModal(null)} onImported={reload} />
      <ViewModal open={modal?.type === "saveAs" || modal?.type === "rename"} busy={busy}
        title={modal?.type === "rename" ? COPY.LIST.RENAME : COPY.LIST.SAVE_AS}
        initialName={modal?.type === "rename" ? view.name : ""} initialShared={modal?.type === "rename" ? view.shared : true}
        onClose={() => setModal(null)} onSave={(v) => saveView(v, modal?.type === "saveAs")} />
    </div>
  );
}
