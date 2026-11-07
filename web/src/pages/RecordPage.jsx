import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Alert, BackLink, Button, Card, CardContent, ErrorState, IconButton, LoadingPage, Menu, Tabs, useNotifications,
} from "@kasumi/ui";
import { Check, MoreVertical, Plus } from "lucide-react";
import { api } from "@/api.js";
import { COPY } from "@/copy.js";
import { dangerConfirm } from "@/confirm.js";
import { useApi, useObjectMeta } from "@/hooks.js";
import { objectIcon } from "@/icons.js";
import FieldValue from "@/records/FieldValue.jsx";
import InlineCell from "@/records/InlineCell.jsx";
import PathBar from "@/records/PathBar.jsx";
import RelatedTab from "@/records/RelatedTab.jsx";
import HistoryList from "@/records/HistoryList.jsx";
import ActivityPanel from "@/records/ActivityPanel.jsx";
import RecordModal from "@/records/RecordModal.jsx";
import OwnerModal from "@/records/OwnerModal.jsx";
import ConvertLeadModal from "@/records/ConvertLeadModal.jsx";
import FeedPanel from "@/feed/FeedPanel.jsx";
import ApprovalBar from "@/approvals/ApprovalBar.jsx";
import ApprovalHistory from "@/approvals/ApprovalHistory.jsx";
import StageHistory from "@/records/StageHistory.jsx";

const SYSTEM_SECTION = ["owner", "created_by", "created_at", "updated_by", "updated_at"];
const ACTIVITY_OBJECTS = new Set(["task", "event", "note"]);
const QUICK_CASE = { account: (r) => ({ account: r.id }), contact: (r) => ({ contact: r.id, ...(r.account ? { account: r.account } : {}) }) };

function Section({ title, fields, meta, record, onSaved, readOnly }) {
  return (
    <section aria-label={title}>
      <h3 className="mb-2 rounded-control bg-surface-subtle px-3 py-1.5 text-label text-fg">{title}</h3>
      <dl className="grid gap-x-6 md:grid-cols-2">
        {fields.map((f) => (
          <div key={f.name} className={`border-b border-line-muted px-1 py-2 ${f.type === "textarea" ? "md:col-span-2" : ""}`}>
            <dt className="text-caption text-fg-muted">{f.label}</dt>
            <dd className="mt-0.5 text-body text-fg">
              {readOnly ? <FieldValue field={f} record={record} /> : <InlineCell meta={meta} field={f} record={record} onSaved={onSaved} />}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function QuickCreate({ object, open, initial, initialNames, onClose, onSaved }) {
  const { meta } = useObjectMeta(open ? object : null);
  return <RecordModal meta={meta} open={open} initial={initial} initialNames={initialNames} onClose={onClose}
    onSaved={(_, { andNew }) => { if (!andNew) onClose(); onSaved(); }} />;
}

export default function RecordPage() {
  const { object, id } = useParams();
  const navigate = useNavigate();
  const { notify, confirmAction, promptAction } = useNotifications();
  const { meta, error: metaError } = useObjectMeta(object);
  const { data: record, error, loading, reload, setData } = useApi(`/records/${object}/${id}`);
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState("details");
  const [following, setFollowing] = useState(false);
  const approvals = useApi(`/records/${object}/${id}/approvals?v=${version}`);
  useEffect(() => {
    let live = true;
    api(`/records/${object}/${id}/feed`).then((f) => live && setFollowing(f.following), () => {});
    return () => { live = false; };
  }, [object, id, version]);
  const toggleFollow = () => api(`/records/${object}/${id}/follow`, { method: "POST" })
    .then((r) => setFollowing(r.following), (err) => notify(err.message, "error"));

  useEffect(() => { setTab("details"); }, [id]);

  if (metaError || error) {
    const err = metaError ?? error;
    const message = err.status === 404 ? COPY.COMMON.NOT_FOUND : err.status === 403 ? COPY.COMMON.NO_ACCESS : err.message;
    return <ErrorState message={message} onRetry={err.status >= 500 ? reload : undefined} retryLabel={COPY.COMMON.RETRY} />;
  }
  if (!meta || (loading && !record)) return <LoadingPage />;

  const bump = () => setVersion((v) => v + 1);
  const saved = (rec) => { setData(rec); bump(); };
  const byName = new Map(meta.fields.map((f) => [f.name, f]));
  const Icon = objectIcon(meta.icon);
  const converted = object === "lead" && record.is_converted;

  const patch = (body) => {
    setBusy(true);
    api(`/records/${object}/${id}`, { method: "PATCH", body }).then(
      (rec) => { setBusy(false); saved(rec); notify(COPY.RECORD.SAVED(meta.label), "success"); },
      (err) => { setBusy(false); notify(err.message, "error"); },
    );
  };

  const remove = async () => {
    if (!(await confirmAction(dangerConfirm(COPY.COMMON.DELETE, COPY.RECORD.DELETE_CONFIRM(record.name ?? meta.label))))) return;
    api(`/records/${object}/${id}`, { method: "DELETE" }).then(
      () => { notify(COPY.COMMON.DELETED, "success"); navigate(`/o/${object}`); },
      (err) => notify(err.message, "error"),
    );
  };

  const createQuote = () => {
    setBusy(true);
    api(`/opportunities/${id}/quote`, { method: "POST" }).then(
      (q) => { setBusy(false); notify(COPY.RECORD.QUOTE_CREATED, "success"); navigate(`/r/quote/${q.id}`); },
      (err) => { setBusy(false); notify(err.message, "error"); },
    );
  };

  const changeOwner = (ownerId, name) => {
    setBusy(true);
    api(`/records/${object}/${id}`, { method: "PATCH", body: { ownerId } }).then(
      (rec) => { setBusy(false); setModal(null); saved(rec); notify(COPY.RECORD.OWNER_CHANGED(name), "success"); },
      (err) => { setBusy(false); notify(err.message, "error"); },
    );
  };

  const highlights = meta.layout.highlights.map((n) => byName.get(n)).filter(Boolean);
  const sections = meta.layout.sections.map((s) => ({ ...s, fields: s.fields.map((n) => byName.get(n)).filter((f) => f && !f.system) }))
    .filter((s) => s.fields.length);
  const pending = approvals.data?.history.find((h) => h.status === "pending") ?? null;
  const submitForApproval = async () => {
    const comment = await promptAction({ title: COPY.APPROVAL.SUBMIT_TITLE, description: COPY.APPROVAL.COMMENT,
      confirmText: COPY.APPROVAL.SUBMIT, cancelText: COPY.COMMON.CANCEL });
    if (comment === null) return;
    api(`/records/${object}/${id}/approvals`, { method: "POST", body: { comment } }).then(
      () => { notify(COPY.APPROVAL.SUBMITTED, "success"); bump(); },
      (err) => notify(err.message, "error"),
    );
  };
  const cloneValues = Object.fromEntries(meta.fields.filter((f) => !f.system && !f.readonly).map((f) => [f.name, record[f.name]]));

  const tabs = [
    { id: "details", label: COPY.RECORD.DETAILS, content: (
      <div className="flex flex-col gap-5 pt-4">
        {sections.map((s) => <Section key={s.label} title={s.label} fields={s.fields} meta={meta} record={record} onSaved={saved} readOnly={converted} />)}
        <Section title={COPY.RECORD.SYSTEM} fields={SYSTEM_SECTION.map((n) => byName.get(n))} meta={meta} record={record} readOnly />
      </div>
    ) },
    { id: "chatter", label: COPY.FEED.TAB, content: <FeedPanel object={object} recordId={id} version={version} onPosted={bump} /> },
    { id: "related", label: COPY.RECORD.RELATED, content: (
      <div className="flex flex-col gap-4 pt-4">
        {object === "opportunity" && <StageHistory recordId={id} version={version} />}
        <RelatedTab object={object} record={record} version={version} onChanged={reload} />
        {approvals.data && (approvals.data.hasProcess || approvals.data.history.length > 0) && <ApprovalHistory history={approvals.data.history} />}
      </div>
    ) },
    { id: "history", label: COPY.RECORD.HISTORY, content: <div className="pt-4"><HistoryList object={object} id={id} version={version} /></div> },
  ];

  return (
    <div className="flex flex-col gap-4">
      <BackLink as={Link} to={`/o/${object}`}>{meta.plural}</BackLink>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start gap-3">
            <span className="rounded-control bg-accent-subtle p-2"><Icon aria-hidden="true" className="h-6 w-6 text-fg" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-caption text-fg-muted">{meta.label}</p>
              <h1 className="truncate text-title-lg text-fg">{record.name || record.id}</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              {object === "lead" && !converted && <Button onClick={() => setModal("convert")}>{COPY.RECORD.CONVERT}</Button>}
              {object === "opportunity" && <Button variant="secondary" onClick={createQuote} loading={busy}>{COPY.RECORD.CREATE_QUOTE}</Button>}
              {QUICK_CASE[object] && <Button variant="secondary" onClick={() => setModal("newCase")}>{COPY.RECORD.NEW_CASE}</Button>}
              {QUICK_CASE[object] && <Button variant="secondary" onClick={() => setModal("newNote")}>{COPY.RECORD.NEW_NOTE}</Button>}
              <Button variant="secondary" onClick={toggleFollow} aria-pressed={following}>
                {following ? <Check aria-hidden="true" className="h-4 w-4" /> : <Plus aria-hidden="true" className="h-4 w-4" />}
                {following ? COPY.FEED.FOLLOWING : COPY.FEED.FOLLOW}
              </Button>
              {!converted && <Button variant="secondary" onClick={() => setModal("edit")}>{COPY.COMMON.EDIT}</Button>}
              <Menu label={COPY.RECORD.MORE_ACTIONS} align="end" trigger={<IconButton icon={MoreVertical} label={COPY.RECORD.MORE_ACTIONS} variant="secondary" />}
                items={[
                  ...(approvals.data?.hasProcess && !pending ? [{ label: COPY.APPROVAL.SUBMIT, onSelect: submitForApproval }] : []),
                  { label: COPY.COMMON.CHANGE_OWNER, onSelect: () => setModal("owner") },
                  { label: COPY.COMMON.CLONE, onSelect: () => setModal("clone") },
                  { label: COPY.COMMON.DELETE, tone: "danger", onSelect: remove },
                ]} />
            </div>
          </div>
          {highlights.length > 0 && (
            <dl className="grid gap-3 border-t border-line-muted pt-3 sm:grid-cols-2 lg:grid-cols-4">
              {highlights.map((f) => (
                <div key={f.name} className="min-w-0">
                  <dt className="text-caption text-fg-muted">{f.label}</dt>
                  <dd className="truncate text-body text-fg"><FieldValue field={f} record={record} /></dd>
                </div>
              ))}
            </dl>
          )}
        </CardContent>
      </Card>

      {converted && <Alert tone="info">{COPY.CONVERT.ALREADY}</Alert>}
      <ApprovalBar pending={pending} onChanged={() => { reload(); bump(); }} />
      {meta.pathField && <PathBar meta={meta} record={record} busy={busy} onChange={(v) => patch({ [meta.pathField]: v })} onConvert={() => setModal("convert")} />}

      <div className={ACTIVITY_OBJECTS.has(object) ? "" : "grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]"}>
        <Card><CardContent><Tabs variant="underline" tabs={tabs} value={tab} onChange={setTab} /></CardContent></Card>
        {!ACTIVITY_OBJECTS.has(object) && <ActivityPanel record={record} version={version} onChanged={bump} />}
      </div>

      <RecordModal meta={meta} open={modal === "edit"} record={record} onClose={() => setModal(null)} onSaved={(rec) => { setModal(null); saved(rec); }} />
      <RecordModal meta={meta} open={modal === "clone"} initial={cloneValues} initialNames={record.$names} onClose={() => setModal(null)}
        onSaved={(rec) => { setModal(null); navigate(`/r/${object}/${rec.id}`); }} />
      {QUICK_CASE[object] && (
        <>
          <QuickCreate object="case" open={modal === "newCase"} initial={QUICK_CASE[object](record)}
            initialNames={{ [object]: record.name, account: record.$names?.account ?? record.name }} onClose={() => setModal(null)} onSaved={bump} />
          <QuickCreate object="note" open={modal === "newNote"} initial={{ what: record.id }} initialNames={{ what: record.name }}
            onClose={() => setModal(null)} onSaved={bump} />
        </>
      )}
      <OwnerModal open={modal === "owner"} busy={busy} currentOwnerId={record.ownerId} onClose={() => setModal(null)} onConfirm={changeOwner} />
      {object === "lead" && <ConvertLeadModal lead={record} open={modal === "convert"} onClose={(converted) => { setModal(null); if (converted) { reload(); bump(); } }} />}
    </div>
  );
}
