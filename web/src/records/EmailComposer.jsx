import { useEffect, useState } from "react";
import { Alert, Button, Input, Select, Textarea, useNotifications } from "@kasumi/ui";
import { api } from "@/api.js";
import { COPY } from "@/copy.js";

const E = COPY.EMAIL;

export default function EmailComposer({ record, onSent }) {
  const { notify } = useNotifications();
  const [defaults, setDefaults] = useState(null);
  const [form, setForm] = useState({ to: "", cc: "", bcc: "", subject: "", body: "" });
  const [showCopies, setShowCopies] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    api(`/records/${record.object}/${record.id}/email-defaults`).then(
      (d) => { if (live) { setDefaults(d); setForm((f) => ({ ...f, to: d.to.join(", ") })); } },
      (err) => live && setError(err.message),
    );
    return () => { live = false; };
  }, [record.object, record.id]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const pickTemplate = (id) => {
    setTemplateId(id);
    const t = defaults?.templates.find((x) => x.id === id);
    if (t) setForm((f) => ({ ...f, subject: t.subject, body: t.body }));
  };
  const send = (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    api(`/records/${record.object}/${record.id}/email`, { method: "POST", body: form }).then(
      (msg) => {
        setBusy(false);
        if (msg.status === "Sent") {
          notify(msg.transport === "outbox" ? E.SENT_OUTBOX : E.SENT, "success");
          setForm({ to: defaults?.to.join(", ") ?? "", cc: "", bcc: "", subject: "", body: "" });
          setTemplateId("");
          onSent();
        } else {
          setError(E.FAILED(msg.error));
        }
      },
      (err) => { setBusy(false); setError(err.message); },
    );
  };

  return (
    <form onSubmit={send} className="flex flex-col gap-3 pt-3" noValidate>
      {defaults?.delivery === "outbox" && <Alert tone="info" variant="inline">{E.OUTBOX_NOTE}</Alert>}
      {error && <Alert tone="error" variant="inline">{error}</Alert>}
      <Input label={E.TO} value={form.to} onChange={set("to")} hint={E.TO_HINT} required />
      {showCopies ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label={E.CC} value={form.cc} onChange={set("cc")} />
          <Input label={E.BCC} value={form.bcc} onChange={set("bcc")} />
        </div>
      ) : <div><Button variant="link" size="xs" onClick={() => setShowCopies(true)}>{E.ADD_COPIES}</Button></div>}
      {defaults?.templates.length > 0 && (
        <Select label={E.TEMPLATE} value={templateId} onChange={(e) => pickTemplate(e.target.value)}>
          <option value="">{COPY.COMMON.NONE}</option>
          {defaults.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
      )}
      <Input label={E.SUBJECT} value={form.subject} onChange={set("subject")} required />
      <Textarea label={E.BODY} rows={6} value={form.body} onChange={set("body")} hint={E.MERGE_HINT} />
      <div className="flex justify-end"><Button type="submit" size="sm" loading={busy} disabled={!form.to.trim() || !form.subject.trim()}>{E.SEND}</Button></div>
    </form>
  );
}
