import { useEffect, useState } from "react";
import { Alert, Button, ErrorState, IconButton, Input, LoadingTable, Menu, Modal, PageHeader, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea, useNotifications } from "@kasumi/ui";
import { MoreVertical, Plus } from "lucide-react";
import { api } from "@/api.js";
import { COPY } from "@/copy.js";
import { dangerConfirm } from "@/confirm.js";
import { useApi, useSession } from "@/hooks.js";

const S = COPY.SETUP;
const BLANK = { name: "", object: "", subject: "", body: "" };

function TemplateModal({ template, open, onClose, onSaved }) {
  const { objects } = useSession();
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setError(null); setForm(template ? { ...template, object: template.object ?? "" } : BLANK); } }, [open, template]);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const save = () => {
    setBusy(true);
    const body = { ...form, object: form.object || null };
    const req = template ? api(`/meta/email-templates/${template.id}`, { method: "PUT", body }) : api("/meta/email-templates", { method: "POST", body });
    req.then(() => { setBusy(false); onSaved(); }, (err) => { setBusy(false); setError(err.message); });
  };
  return (
    <Modal open={open} onClose={onClose} size="lg" title={template ? template.name : S.NEW_TEMPLATE} footer={
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>{COPY.COMMON.CANCEL}</Button>
        <Button onClick={save} loading={busy} disabled={!form.name.trim() || !form.subject.trim()}>{COPY.COMMON.SAVE}</Button>
      </div>}>
      <div className="flex flex-col gap-stack">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid gap-4 md:grid-cols-2">
          <Input label={S.RULE_NAME} value={form.name} onChange={set("name")} required />
          <Select label={S.TEMPLATE_OBJECT} value={form.object} onChange={set("object")}>
            <option value="">{S.TEMPLATE_ANY}</option>
            {objects.map((o) => <option key={o.name} value={o.name}>{o.label}</option>)}
          </Select>
        </div>
        <Input label={COPY.EMAIL.SUBJECT} value={form.subject} onChange={set("subject")} required />
        <Textarea label={COPY.EMAIL.BODY} rows={8} value={form.body} onChange={set("body")} hint={COPY.EMAIL.MERGE_HINT} />
      </div>
    </Modal>
  );
}

export default function EmailTemplates() {
  const { notify, confirmAction } = useNotifications();
  const { objects } = useSession();
  const { data, error, loading, reload } = useApi("/meta/email-templates");
  const [editing, setEditing] = useState(null);
  const label = (n) => (n ? objects.find((o) => o.name === n)?.label ?? n : S.TEMPLATE_ANY);
  const remove = async (t) => {
    if (!(await confirmAction(dangerConfirm(COPY.COMMON.DELETE, t.name)))) return;
    api(`/meta/email-templates/${t.id}`, { method: "DELETE" }).then(() => { notify(S.TEMPLATE_DELETED, "success"); reload(); }, (err) => notify(err.message, "error"));
  };
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={S.TEMPLATES} subtitle={S.TEMPLATES_SUBTITLE} showSubtitleOnPhone
        action={<Button onClick={() => setEditing("new")}><Plus aria-hidden="true" className="h-4 w-4" />{S.NEW_TEMPLATE}</Button>} />
      {error && <ErrorState message={error.message} onRetry={reload} retryLabel={COPY.COMMON.RETRY} />}
      {loading && !data && <LoadingTable rows={3} cols={3} />}
      {data && (
        <Table containerClassName="rounded-card border border-line">
          <TableHead><TableRow>
            <TableHeader>{S.RULE_NAME}</TableHeader><TableHeader>{S.TEMPLATE_OBJECT}</TableHeader><TableHeader>{COPY.EMAIL.SUBJECT}</TableHeader>
            <TableHeader><span className="sr-only">{COPY.COMMON.EDIT}</span></TableHeader>
          </TableRow></TableHead>
          <TableBody>
            {data.map((t) => (
              <TableRow key={t.id}>
                <TableCell>{t.name}</TableCell><TableCell>{label(t.object)}</TableCell><TableCell>{t.subject}</TableCell>
                <TableCell>
                  <Menu label={COPY.COMMON.EDIT} align="end" trigger={<IconButton icon={MoreVertical} label={`${COPY.COMMON.EDIT} ${t.name}`} variant="ghost" size="xs" />}
                    items={[{ label: COPY.COMMON.EDIT, onSelect: () => setEditing(t) }, { label: COPY.COMMON.DELETE, tone: "danger", onSelect: () => remove(t) }]} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <TemplateModal template={editing === "new" ? null : editing} open={editing !== null} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); notify(S.TEMPLATE_SAVED, "success"); reload(); }} />
    </div>
  );
}
