import { useEffect, useState } from "react";
import {
  Alert, Badge, Button, Checkbox, ErrorState, IconButton, Input, LoadingTable, Menu, Modal, PageHeader, Select, Table,
  TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea, useNotifications,
} from "@kasumi/ui";
import { MoreVertical, Plus, X } from "lucide-react";
import { api } from "@/api.js";
import { COPY } from "@/copy.js";
import { dangerConfirm } from "@/confirm.js";
import { useApi, useObjectMeta, useSession } from "@/hooks.js";

const S = COPY.SETUP;
const BLANK = { object: "opportunity", name: "", criteria: "", approverType: "manager", approverId: "", lockRecord: true, approveActions: [], rejectActions: [], active: true };

function Actions({ label, actions, fields, onChange }) {
  const set = (i, patch) => onChange(actions.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-label text-fg">{label}</h3>
      {actions.map((a, i) => (
        <div key={i} className="flex flex-wrap items-end gap-2">
          <Select label={S.SET_FIELD} value={a.field} onChange={(e) => set(i, { field: e.target.value })}>
            {fields.map((f) => <option key={f.name} value={f.name}>{f.label}</option>)}
          </Select>
          <div className="min-w-56 flex-1"><Input label={S.SET_VALUE} hint={S.SET_VALUE_HINT} className="font-mono" value={a.value} onChange={(e) => set(i, { value: e.target.value })} /></div>
          <IconButton icon={X} label={COPY.COMMON.REMOVE} variant="ghost" size="sm" onClick={() => onChange(actions.filter((_, j) => j !== i))} />
        </div>
      ))}
      <div><Button size="sm" variant="secondary" disabled={!fields.length} onClick={() => onChange([...actions, { field: fields[0].name, value: "" }])}>
        <Plus aria-hidden="true" className="h-4 w-4" />{S.ADD_ACTION}
      </Button></div>
    </section>
  );
}

function ProcessModal({ process, open, onClose, onSaved }) {
  const { objects } = useSession();
  const [form, setForm] = useState(BLANK);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const { meta } = useObjectMeta(form.object);
  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(process ? { ...process, approverId: process.approverId ?? "" } : BLANK);
    api("/users").then(setUsers, () => setUsers([]));
  }, [open, process]);
  const settable = meta?.fields.filter((f) => !f.system && !f.readonly) ?? [];
  const save = () => {
    setBusy(true);
    const req = process ? api(`/meta/approval-processes/${process.id}`, { method: "PUT", body: form }) : api("/meta/approval-processes", { method: "POST", body: form });
    req.then(() => { setBusy(false); onSaved(); }, (err) => { setBusy(false); setError(err.message); });
  };
  return (
    <Modal open={open} onClose={onClose} size="xl" title={process ? process.name : S.NEW_APPROVAL} footer={
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>{COPY.COMMON.CANCEL}</Button>
        <Button onClick={save} loading={busy} disabled={!form.name.trim()}>{COPY.COMMON.SAVE}</Button>
      </div>}>
      <div className="flex flex-col gap-stack">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid gap-4 md:grid-cols-2">
          <Select label={S.OBJECT} value={form.object} disabled={Boolean(process)} onChange={(e) => setForm({ ...form, object: e.target.value, approveActions: [], rejectActions: [] })}>
            {objects.map((o) => <option key={o.name} value={o.name}>{o.label}</option>)}
          </Select>
          <Input label={S.RULE_NAME} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <Textarea label={S.ENTRY_CRITERIA} hint={S.CRITERIA_HINT} rows={2} className="font-mono" value={form.criteria} onChange={(e) => setForm({ ...form, criteria: e.target.value })} />
        <div className="grid gap-4 md:grid-cols-2">
          <Select label={S.APPROVER} value={form.approverType} onChange={(e) => setForm({ ...form, approverType: e.target.value })}>
            {Object.entries(S.APPROVER_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          {form.approverType === "user" && (
            <Select label={S.APPROVER_USER} value={form.approverId} onChange={(e) => setForm({ ...form, approverId: e.target.value })}>
              <option value="">{COPY.COMMON.NONE}</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          )}
        </div>
        <Checkbox label={S.LOCK} checked={form.lockRecord} onChange={(e) => setForm({ ...form, lockRecord: e.target.checked })} />
        <Actions label={S.ON_APPROVE} actions={form.approveActions} fields={settable} onChange={(approveActions) => setForm({ ...form, approveActions })} />
        <Actions label={S.ON_REJECT} actions={form.rejectActions} fields={settable} onChange={(rejectActions) => setForm({ ...form, rejectActions })} />
        <Checkbox label={S.ACTIVE} checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
      </div>
    </Modal>
  );
}

export default function ApprovalProcesses() {
  const { notify, confirmAction } = useNotifications();
  const { objects } = useSession();
  const { data, error, loading, reload } = useApi("/meta/approval-processes");
  const [editing, setEditing] = useState(null);
  const label = (n) => objects.find((o) => o.name === n)?.label ?? n;
  const remove = async (p) => {
    if (!(await confirmAction(dangerConfirm(COPY.COMMON.DELETE, p.name)))) return;
    api(`/meta/approval-processes/${p.id}`, { method: "DELETE" }).then(() => { notify(S.PROCESS_DELETED, "success"); reload(); }, (err) => notify(err.message, "error"));
  };
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={S.APPROVALS} subtitle={S.APPROVALS_SUBTITLE} showSubtitleOnPhone
        action={<Button onClick={() => setEditing("new")}><Plus aria-hidden="true" className="h-4 w-4" />{S.NEW_APPROVAL}</Button>} />
      {error && <ErrorState message={error.message} onRetry={reload} retryLabel={COPY.COMMON.RETRY} />}
      {loading && !data && <LoadingTable rows={3} cols={4} />}
      {data && (
        <Table containerClassName="rounded-card border border-line">
          <TableHead><TableRow>
            <TableHeader>{S.RULE_NAME}</TableHeader><TableHeader>{S.OBJECT}</TableHeader><TableHeader>{S.APPROVER}</TableHeader>
            <TableHeader>{S.ACTIVE}</TableHeader><TableHeader><span className="sr-only">{COPY.COMMON.EDIT}</span></TableHeader>
          </TableRow></TableHead>
          <TableBody>
            {data.map((p) => (
              <TableRow key={p.id}>
                <TableCell description={p.criteria}>{p.name}</TableCell><TableCell>{label(p.object)}</TableCell>
                <TableCell>{S.APPROVER_TYPES[p.approverType]}</TableCell>
                <TableCell>{p.active ? COPY.COMMON.YES : <Badge tone="warning">{COPY.COMMON.NO}</Badge>}</TableCell>
                <TableCell>
                  <Menu label={COPY.COMMON.EDIT} align="end" trigger={<IconButton icon={MoreVertical} label={`${COPY.COMMON.EDIT} ${p.name}`} variant="ghost" size="xs" />}
                    items={[{ label: COPY.COMMON.EDIT, onSelect: () => setEditing(p) }, { label: COPY.COMMON.DELETE, tone: "danger", onSelect: () => remove(p) }]} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <ProcessModal process={editing === "new" ? null : editing} open={editing !== null} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); notify(S.PROCESS_SAVED, "success"); reload(); }} />
    </div>
  );
}
