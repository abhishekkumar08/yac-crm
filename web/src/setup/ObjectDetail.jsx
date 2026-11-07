import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Alert, BackLink, Badge, Button, Card, CardContent, Checkbox, ErrorState, Input, LoadingCard, Menu, IconButton, Modal,
  PageHeader, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tabs, Textarea, useNotifications,
} from "@kasumi/ui";
import { MoreVertical, Plus } from "lucide-react";
import { api } from "@/api.js";
import { COPY } from "@/copy.js";
import { dangerConfirm } from "@/confirm.js";
import { invalidateMeta, useApi, useObjectMeta, useSession } from "@/hooks.js";
import FieldEditor from "@/setup/FieldEditor.jsx";
import LayoutEditor from "@/setup/LayoutEditor.jsx";

function DetailsTab({ meta, onSaved }) {
  const { notify } = useNotifications();
  const { reloadObjects } = useSession();
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm({ label: meta.label, plural: meta.plural, description: meta.description ?? "", pathField: meta.pathField ?? "" }), [meta]);
  const save = () => {
    setBusy(true);
    api(`/meta/objects/${meta.name}`, { method: "PATCH", body: { ...form, pathField: form.pathField || null } }).then(
      () => { setBusy(false); notify(COPY.SETUP.OBJECT_SAVED, "success"); reloadObjects(); onSaved(); },
      (err) => { setBusy(false); notify(err.message, "error"); },
    );
  };
  return (
    <div className="flex max-w-2xl flex-col gap-stack pt-4">
      <Input label={COPY.SETUP.OBJECT_LABEL} value={form.label ?? ""} onChange={(e) => setForm({ ...form, label: e.target.value })} />
      <Input label={COPY.SETUP.OBJECT_PLURAL} value={form.plural ?? ""} onChange={(e) => setForm({ ...form, plural: e.target.value })} />
      <Textarea label={COPY.SETUP.OBJECT_DESCRIPTION} rows={2} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <Select label={COPY.RECORD.PATH} value={form.pathField ?? ""} onChange={(e) => setForm({ ...form, pathField: e.target.value })}>
        <option value="">{COPY.COMMON.NONE}</option>
        {meta.fields.filter((f) => f.type === "picklist").map((f) => <option key={f.name} value={f.name}>{f.label}</option>)}
      </Select>
      <p className="text-caption text-fg-muted">{COPY.SETUP.API_NAME}: <code>{meta.name}</code></p>
      <div><Button onClick={save} loading={busy}>{COPY.COMMON.SAVE}</Button></div>
    </div>
  );
}

function FieldsTab({ meta, onSaved }) {
  const { notify, confirmAction } = useNotifications();
  const [editing, setEditing] = useState(null);
  const remove = async (f) => {
    if (!(await confirmAction(dangerConfirm(COPY.COMMON.DELETE, COPY.SETUP.FIELD_DELETE_CONFIRM(f.label))))) return;
    api(`/meta/objects/${meta.name}/fields/${f.name}`, { method: "DELETE" }).then(
      () => { notify(COPY.SETUP.FIELD_DELETED, "success"); onSaved(); },
      (err) => notify(err.message, "error"),
    );
  };
  return (
    <div className="flex flex-col gap-3 pt-4">
      <div><Button size="sm" onClick={() => setEditing("new")}><Plus aria-hidden="true" className="h-4 w-4" />{COPY.SETUP.NEW_FIELD}</Button></div>
      <Table containerClassName="rounded-card border border-line">
        <TableHead><TableRow>
          <TableHeader>{COPY.SETUP.FIELD_LABEL}</TableHeader><TableHeader>{COPY.SETUP.API_NAME}</TableHeader>
          <TableHeader>{COPY.SETUP.FIELD_TYPE}</TableHeader><TableHeader><span className="sr-only">{COPY.COMMON.EDIT}</span></TableHeader>
        </TableRow></TableHead>
        <TableBody>
          {meta.fields.filter((f) => !f.system).map((f) => (
            <TableRow key={f.name}>
              <TableCell>{f.label}{f.required && <Badge className="ml-2" tone="outline">{COPY.SETUP.REQUIRED}</Badge>}</TableCell>
              <TableCell><code className="text-caption">{f.name}</code></TableCell>
              <TableCell>{f.type}{f.referenceTo ? ` (${f.referenceTo})` : ""}{f.custom && <Badge className="ml-2" tone="accent">{COPY.SETUP.CUSTOM}</Badge>}</TableCell>
              <TableCell>
                <Menu label={COPY.COMMON.EDIT} align="end" trigger={<IconButton icon={MoreVertical} label={`${COPY.COMMON.EDIT} ${f.label}`} variant="ghost" size="xs" />}
                  items={[
                    { label: COPY.COMMON.EDIT, onSelect: () => setEditing(f) },
                    ...(f.custom ? [{ label: COPY.COMMON.DELETE, tone: "danger", onSelect: () => remove(f) }] : []),
                  ]} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <FieldEditor meta={meta} field={editing === "new" ? null : editing} open={editing !== null} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); onSaved(); }} />
    </div>
  );
}

function RuleModal({ meta, rule, open, onClose, onSaved }) {
  const [form, setForm] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) { setError(null); setForm(rule ? { ...rule, field: rule.field ?? "" } : { name: "", condition: "", message: "", field: "", active: true }); }
  }, [open, rule]);
  const save = () => {
    setBusy(true);
    const body = { ...form, field: form.field || null, object: meta.name };
    const req = rule ? api(`/meta/rules/${rule.id}`, { method: "PATCH", body }) : api("/meta/rules", { method: "POST", body });
    req.then(() => { setBusy(false); onSaved(); }, (err) => { setBusy(false); setError(err.message); });
  };
  return (
    <Modal open={open} onClose={onClose} title={rule ? rule.name : COPY.SETUP.NEW_RULE} size="lg" footer={
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>{COPY.COMMON.CANCEL}</Button>
        <Button onClick={save} loading={busy} disabled={!form.name?.trim() || !form.condition?.trim() || !form.message?.trim()}>{COPY.COMMON.SAVE}</Button>
      </div>}>
      <div className="flex flex-col gap-stack">
        {error && <Alert tone="error">{error}</Alert>}
        <Input label={COPY.SETUP.RULE_NAME} value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <Textarea label={COPY.SETUP.RULE_CONDITION} hint={COPY.SETUP.RULE_CONDITION_HINT} rows={3} className="font-mono"
          value={form.condition ?? ""} onChange={(e) => setForm({ ...form, condition: e.target.value })} required />
        <Input label={COPY.SETUP.RULE_MESSAGE} value={form.message ?? ""} onChange={(e) => setForm({ ...form, message: e.target.value })} required />
        <Select label={COPY.SETUP.RULE_FIELD} value={form.field ?? ""} onChange={(e) => setForm({ ...form, field: e.target.value })}>
          <option value="">{COPY.SETUP.RULE_TOP}</option>
          {meta.fields.filter((f) => !f.system).map((f) => <option key={f.name} value={f.name}>{f.label}</option>)}
        </Select>
        <Checkbox label={COPY.SETUP.ACTIVE} checked={Boolean(form.active)} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
      </div>
    </Modal>
  );
}

function RulesTab({ meta }) {
  const { notify, confirmAction } = useNotifications();
  const { data, error, loading, reload } = useApi(`/meta/objects/${meta.name}/rules`);
  const [editing, setEditing] = useState(null);
  const remove = async (r) => {
    if (!(await confirmAction(dangerConfirm(COPY.COMMON.DELETE, r.name)))) return;
    api(`/meta/rules/${r.id}`, { method: "DELETE" }).then(() => { notify(COPY.SETUP.RULE_DELETED, "success"); reload(); }, (err) => notify(err.message, "error"));
  };
  if (error) return <ErrorState message={error.message} onRetry={reload} retryLabel={COPY.COMMON.RETRY} />;
  if (loading && !data) return <LoadingCard />;
  return (
    <div className="flex flex-col gap-3 pt-4">
      <div><Button size="sm" onClick={() => setEditing("new")}><Plus aria-hidden="true" className="h-4 w-4" />{COPY.SETUP.NEW_RULE}</Button></div>
      <Table containerClassName="rounded-card border border-line">
        <TableHead><TableRow>
          <TableHeader>{COPY.SETUP.RULE_NAME}</TableHeader><TableHeader>{COPY.SETUP.RULE_CONDITION}</TableHeader>
          <TableHeader>{COPY.SETUP.ACTIVE}</TableHeader><TableHeader><span className="sr-only">{COPY.COMMON.EDIT}</span></TableHeader>
        </TableRow></TableHead>
        <TableBody>
          {data.map((r) => (
            <TableRow key={r.id}>
              <TableCell description={r.message}>{r.name}</TableCell>
              <TableCell><code className="text-caption">{r.condition}</code></TableCell>
              <TableCell>{r.active ? COPY.COMMON.YES : COPY.COMMON.NO}</TableCell>
              <TableCell>
                <Menu label={COPY.COMMON.EDIT} align="end" trigger={<IconButton icon={MoreVertical} label={`${COPY.COMMON.EDIT} ${r.name}`} variant="ghost" size="xs" />}
                  items={[{ label: COPY.COMMON.EDIT, onSelect: () => setEditing(r) }, { label: COPY.COMMON.DELETE, tone: "danger", onSelect: () => remove(r) }]} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <RuleModal meta={meta} rule={editing === "new" ? null : editing} open={editing !== null} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); notify(COPY.SETUP.RULE_SAVED, "success"); reload(); }} />
    </div>
  );
}

export default function ObjectDetail() {
  const { name } = useParams();
  const { meta, error } = useObjectMeta(name);
  const [tab, setTab] = useState("fields");
  if (error) return <ErrorState message={error.message} />;
  if (!meta) return <LoadingCard />;
  const refresh = () => invalidateMeta();
  return (
    <div className="flex flex-col gap-4">
      <BackLink as={Link} to="/setup/objects">{COPY.SETUP.OBJECT_MANAGER}</BackLink>
      <PageHeader title={meta.label} eyebrow={meta.custom ? COPY.SETUP.CUSTOM : COPY.SETUP.STANDARD} subtitle={meta.description ?? undefined} />
      <Card><CardContent>
        <Tabs variant="underline" value={tab} onChange={setTab} tabs={[
          { id: "details", label: COPY.SETUP.DETAILS, content: <DetailsTab meta={meta} onSaved={refresh} /> },
          { id: "fields", label: COPY.SETUP.FIELDS, content: <FieldsTab meta={meta} onSaved={refresh} /> },
          { id: "layout", label: COPY.SETUP.LAYOUT, content: <LayoutEditor meta={meta} onSaved={refresh} /> },
          { id: "rules", label: COPY.SETUP.RULES, content: <RulesTab meta={meta} /> },
        ]} />
      </CardContent></Card>
    </div>
  );
}
