import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge, Button, Input, Modal, PageHeader, RadioGroup, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TextLink, Textarea, useNotifications } from "@kasumi/ui";
import { Plus } from "lucide-react";
import { api } from "@/api.js";
import { COPY } from "@/copy.js";
import { invalidateMeta, useSession } from "@/hooks.js";

function NewObjectModal({ open, onClose }) {
  const { notify } = useNotifications();
  const { reloadObjects } = useSession();
  const navigate = useNavigate();
  const [form, setForm] = useState({ label: "", plural: "", description: "", nameType: "text", nameFormat: "A-{0000}" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const save = () => {
    setBusy(true);
    api("/meta/objects", { method: "POST", body: form }).then(
      (obj) => { setBusy(false); invalidateMeta(); reloadObjects(); notify(COPY.SETUP.OBJECT_SAVED, "success"); onClose(); navigate(`/setup/objects/${obj.name}`); },
      (err) => { setBusy(false); setError(err.message); },
    );
  };
  return (
    <Modal open={open} onClose={onClose} title={COPY.SETUP.NEW_OBJECT} footer={
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>{COPY.COMMON.CANCEL}</Button>
        <Button onClick={save} loading={busy} disabled={!form.label.trim() || !form.plural.trim()}>{COPY.COMMON.SAVE}</Button>
      </div>}>
      <div className="flex flex-col gap-stack">
        <Input label={COPY.SETUP.OBJECT_LABEL} value={form.label} onChange={set("label")} required error={error} />
        <Input label={COPY.SETUP.OBJECT_PLURAL} value={form.plural} onChange={set("plural")} required />
        <Textarea label={COPY.SETUP.OBJECT_DESCRIPTION} rows={2} value={form.description} onChange={set("description")} />
        <RadioGroup legend={COPY.SETUP.NAME_TYPE} orientation="horizontal" value={form.nameType} onChange={(v) => setForm({ ...form, nameType: v })}
          options={[{ value: "text", label: COPY.SETUP.NAME_TEXT }, { value: "autonumber", label: COPY.SETUP.NAME_AUTO }]} />
        {form.nameType === "autonumber" && <Input label={COPY.SETUP.NAME_FORMAT} hint={COPY.SETUP.NAME_FORMAT_HINT} value={form.nameFormat} onChange={set("nameFormat")} />}
      </div>
    </Modal>
  );
}

export default function ObjectManager() {
  const { objects } = useSession();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={COPY.SETUP.OBJECT_MANAGER} subtitle={COPY.SETUP.OBJECTS_SUBTITLE}
        action={<Button onClick={() => setOpen(true)}><Plus aria-hidden="true" className="h-4 w-4" />{COPY.SETUP.NEW_OBJECT}</Button>} />
      <Table containerClassName="rounded-card border border-line">
        <TableHead><TableRow><TableHeader>{COPY.SETUP.OBJECT_LABEL}</TableHeader><TableHeader>{COPY.SETUP.API_NAME}</TableHeader><TableHeader>{COPY.SETUP.TYPE}</TableHeader></TableRow></TableHead>
        <TableBody>
          {objects.map((o) => (
            <TableRow key={o.name}>
              <TableCell><TextLink as={Link} to={`/setup/objects/${o.name}`}>{o.label}</TextLink></TableCell>
              <TableCell><code className="text-caption">{o.name}</code></TableCell>
              <TableCell><Badge tone={o.custom ? "accent" : "neutral"}>{o.custom ? COPY.SETUP.CUSTOM : COPY.SETUP.STANDARD}</Badge></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <NewObjectModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
