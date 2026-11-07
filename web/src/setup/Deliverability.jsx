import { useEffect, useState } from "react";
import { Alert, Button, Checkbox, ErrorState, Input, LoadingCard, PageHeader, Switch, useNotifications } from "@kasumi/ui";
import { api } from "@/api.js";
import { COPY } from "@/copy.js";
import { useApi } from "@/hooks.js";

const S = COPY.SETUP;

export default function Deliverability() {
  const { notify } = useNotifications();
  const { data, error, loading, reload } = useApi("/meta/deliverability");
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState(null);
  useEffect(() => { if (data) setForm(data); }, [data]);
  if (error) return <ErrorState message={error.message} onRetry={reload} retryLabel={COPY.COMMON.RETRY} />;
  if (loading || !form) return <LoadingCard />;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const save = () => {
    setBusy(true);
    setSaveError(null);
    api("/meta/deliverability", { method: "PUT", body: { ...form, port: Number(form.port) } }).then(
      (d) => { setBusy(false); setForm(d); notify(S.DELIVERABILITY_SAVED, "success"); },
      (err) => { setBusy(false); setSaveError(err.message); },
    );
  };
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title={S.DELIVERABILITY} subtitle={S.DELIVERABILITY_SUBTITLE} showSubtitleOnPhone
        action={<Button onClick={save} loading={busy}>{COPY.COMMON.SAVE}</Button>} />
      {saveError && <Alert tone="error">{saveError}</Alert>}
      <Switch label={S.SMTP_ENABLE} checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} />
      <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
        <Input label={S.SMTP_HOST} value={form.host} onChange={set("host")} disabled={!form.enabled} />
        <Input label={S.SMTP_PORT} type="number" value={form.port} onChange={set("port")} disabled={!form.enabled} />
      </div>
      <Checkbox label={S.SMTP_SECURE} checked={form.secure} onChange={set("secure")} disabled={!form.enabled} />
      <Input label={S.SMTP_USER} value={form.user} onChange={set("user")} disabled={!form.enabled} autoComplete="off" />
      <Input label={S.SMTP_FROM} type="email" value={form.from} onChange={set("from")} disabled={!form.enabled} />
      <Alert tone={form.passwordSet ? "success" : "warning"} variant="inline">{S.SMTP_PASSWORD(form.passwordSet)}</Alert>
    </div>
  );
}
