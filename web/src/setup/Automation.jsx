import { useEffect, useState } from "react";
import {
  Alert, Badge, Button, Card, CardContent, Checkbox, ErrorState, IconButton, Input, LoadingTable, Menu, Modal, PageHeader,
  Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea, useNotifications,
} from "@kasumi/ui";
import { MoreVertical, Plus, X } from "lucide-react";
import { api } from "@/api.js";
import { COPY } from "@/copy.js";
import { dangerConfirm } from "@/confirm.js";
import { useApi, useObjectMeta, useSession } from "@/hooks.js";

const BLANK = { object: "case", name: "", trigger: "create_or_update", criteria: "", actions: [], active: true };

function ActionRow({ action, fields, users, onChange, onRemove }) {
  return (
    <Card padding="sm"><CardContent className="flex flex-wrap items-end gap-2 p-0">
      <Select label={COPY.SETUP.ACTIONS} value={action.type} onChange={(e) => onChange(e.target.value === "set_field"
        ? { type: "set_field", field: fields[0]?.name ?? "", value: "" } : { type: "create_task", subject: "", dueInDays: 1, assignTo: "owner" })}>
        {Object.entries(COPY.SETUP.ACTION_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </Select>
      {action.type === "set_field" ? (
        <>
          <Select label={COPY.SETUP.SET_FIELD} value={action.field} onChange={(e) => onChange({ ...action, field: e.target.value })}>
            {fields.map((f) => <option key={f.name} value={f.name}>{f.label}</option>)}
          </Select>
          <div className="min-w-56 flex-1"><Input label={COPY.SETUP.SET_VALUE} hint={COPY.SETUP.SET_VALUE_HINT} className="font-mono"
            value={action.value} onChange={(e) => onChange({ ...action, value: e.target.value })} /></div>
        </>
      ) : (
        <>
          <div className="min-w-56 flex-1"><Input label={COPY.SETUP.TASK_SUBJECT} value={action.subject} onChange={(e) => onChange({ ...action, subject: e.target.value })} /></div>
          <Input label={COPY.SETUP.TASK_DUE} type="number" min={0} className="w-24" value={action.dueInDays} onChange={(e) => onChange({ ...action, dueInDays: Number(e.target.value) })} />
          <Select label={COPY.SETUP.TASK_ASSIGN} value={action.assignTo} onChange={(e) => onChange({ ...action, assignTo: e.target.value })}>
            <option value="owner">{COPY.SETUP.ASSIGN_OWNER}</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </>
      )}
      <IconButton icon={X} label={COPY.COMMON.REMOVE} variant="ghost" size="sm" onClick={onRemove} />
    </CardContent></Card>
  );
}

function RuleModal({ rule, open, onClose, onSaved }) {
  const { objects } = useSession();
  const [form, setForm] = useState(BLANK);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const { meta } = useObjectMeta(form.object);
  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(rule ? { ...rule, actions: rule.actions.map((a) => ({ ...a })) } : BLANK);
    api("/users").then(setUsers, () => setUsers([]));
  }, [open, rule]);
  const settable = meta?.fields.filter((f) => !f.system && !f.readonly) ?? [];
  const setAction = (i, a) => setForm({ ...form, actions: form.actions.map((x, j) => (j === i ? a : x)) });
  const save = () => {
    setBusy(true);
    const req = rule ? api(`/meta/automations/${rule.id}`, { method: "PATCH", body: form }) : api("/meta/automations", { method: "POST", body: form });
    req.then(() => { setBusy(false); onSaved(); }, (err) => { setBusy(false); setError(err.message); });
  };
  return (
    <Modal open={open} onClose={onClose} size="xl" title={rule ? rule.name : COPY.SETUP.NEW_AUTOMATION} footer={
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>{COPY.COMMON.CANCEL}</Button>
        <Button onClick={save} loading={busy} disabled={!form.name.trim() || !form.actions.length}>{COPY.COMMON.SAVE}</Button>
      </div>}>
      <div className="flex flex-col gap-stack">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid gap-4 md:grid-cols-3">
          <Select label={COPY.SETUP.OBJECT} value={form.object} disabled={Boolean(rule)} onChange={(e) => setForm({ ...form, object: e.target.value, actions: [] })}>
            {objects.map((o) => <option key={o.name} value={o.name}>{o.label}</option>)}
          </Select>
          <Input label={COPY.SETUP.RULE_NAME} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Select label={COPY.SETUP.TRIGGER} value={form.trigger} onChange={(e) => setForm({ ...form, trigger: e.target.value })}>
            {Object.entries(COPY.SETUP.TRIGGERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
        <Textarea label={COPY.SETUP.CRITERIA} hint={COPY.SETUP.CRITERIA_HINT} rows={2} className="font-mono" value={form.criteria} onChange={(e) => setForm({ ...form, criteria: e.target.value })} />
        <h3 className="text-label text-fg">{COPY.SETUP.ACTIONS}</h3>
        {form.actions.map((a, i) => (
          <ActionRow key={i} action={a} fields={settable} users={users} onChange={(next) => setAction(i, next)}
            onRemove={() => setForm({ ...form, actions: form.actions.filter((_, j) => j !== i) })} />
        ))}
        <div><Button size="sm" variant="secondary" onClick={() => setForm({ ...form, actions: [...form.actions, { type: "create_task", subject: "", dueInDays: 1, assignTo: "owner" }] })}>
          <Plus aria-hidden="true" className="h-4 w-4" />{COPY.SETUP.ADD_ACTION}
        </Button></div>
        <Checkbox label={COPY.SETUP.ACTIVE} checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
      </div>
    </Modal>
  );
}

export default function Automation() {
  const { notify, confirmAction } = useNotifications();
  const { objects } = useSession();
  const { data, error, loading, reload } = useApi("/meta/automations");
  const [editing, setEditing] = useState(null);
  const label = (n) => objects.find((o) => o.name === n)?.label ?? n;
  const remove = async (r) => {
    if (!(await confirmAction(dangerConfirm(COPY.COMMON.DELETE, r.name)))) return;
    api(`/meta/automations/${r.id}`, { method: "DELETE" }).then(() => { notify(COPY.SETUP.AUTOMATION_DELETED, "success"); reload(); }, (err) => notify(err.message, "error"));
  };
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={COPY.SETUP.AUTOMATION} subtitle={COPY.SETUP.AUTOMATION_SUBTITLE} showSubtitleOnPhone
        action={<Button onClick={() => setEditing("new")}><Plus aria-hidden="true" className="h-4 w-4" />{COPY.SETUP.NEW_AUTOMATION}</Button>} />
      {error && <ErrorState message={error.message} onRetry={reload} retryLabel={COPY.COMMON.RETRY} />}
      {loading && !data && <LoadingTable rows={3} cols={4} />}
      {data && (
        <Table containerClassName="rounded-card border border-line">
          <TableHead><TableRow>
            <TableHeader>{COPY.SETUP.RULE_NAME}</TableHeader><TableHeader>{COPY.SETUP.OBJECT}</TableHeader>
            <TableHeader>{COPY.SETUP.TRIGGER}</TableHeader><TableHeader>{COPY.SETUP.ACTIVE}</TableHeader><TableHeader><span className="sr-only">{COPY.COMMON.EDIT}</span></TableHeader>
          </TableRow></TableHead>
          <TableBody>
            {data.map((r) => (
              <TableRow key={r.id}>
                <TableCell description={r.criteria}>{r.name}</TableCell><TableCell>{label(r.object)}</TableCell>
                <TableCell>{COPY.SETUP.TRIGGERS[r.trigger]}</TableCell>
                <TableCell>{r.active ? COPY.COMMON.YES : <Badge tone="warning">{COPY.COMMON.NO}</Badge>}</TableCell>
                <TableCell>
                  <Menu label={COPY.COMMON.EDIT} align="end" trigger={<IconButton icon={MoreVertical} label={`${COPY.COMMON.EDIT} ${r.name}`} variant="ghost" size="xs" />}
                    items={[{ label: COPY.COMMON.EDIT, onSelect: () => setEditing(r) }, { label: COPY.COMMON.DELETE, tone: "danger", onSelect: () => remove(r) }]} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <RuleModal rule={editing === "new" ? null : editing} open={editing !== null} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); notify(COPY.SETUP.AUTOMATION_SAVED, "success"); reload(); }} />
    </div>
  );
}
