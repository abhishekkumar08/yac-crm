import { useEffect, useState } from "react";
import { Alert, Button, Checkbox, IconButton, Input, PageHeader, Select, Switch, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, useNotifications } from "@kasumi/ui";
import { Plus, X } from "lucide-react";
import { api } from "@/api.js";
import { COPY } from "@/copy.js";
import { invalidateMeta, useSession } from "@/hooks.js";

const C = COPY.SETUP.CURRENCY;

export default function Currencies() {
  const { notify } = useNotifications();
  const { currency, reloadCurrency } = useSession();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!currency) return;
    const rows = currency.currencies.length ? currency.currencies : [{ isoCode: currency.corporate, name: currency.corporate, rate: 1, active: true }];
    setForm({ multiCurrency: currency.multiCurrency, corporate: currency.corporate, currencies: rows.map((c) => ({ ...c, isNew: false })) });
  }, [currency]);
  if (!form) return null;

  const setRow = (i, patch) => setForm({ ...form, currencies: form.currencies.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const save = () => {
    setBusy(true);
    setError(null);
    const body = { ...form, currencies: form.currencies.map(({ isoCode, name, rate, active }) => ({ isoCode: isoCode.trim().toUpperCase(), name, rate: Number(rate), active })) };
    api("/meta/currencies", { method: "PUT", body }).then(
      () => { setBusy(false); invalidateMeta(); reloadCurrency(); notify(C.SAVED, "success"); },
      (err) => { setBusy(false); setError(err.message); },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={C.TITLE} subtitle={C.SUBTITLE} showSubtitleOnPhone
        action={<Button onClick={save} loading={busy}>{COPY.COMMON.SAVE}</Button>} />
      {error && <Alert tone="error">{error}</Alert>}
      <Switch label={C.ENABLE} description={C.ENABLE_HINT} checked={form.multiCurrency} onChange={(v) => setForm({ ...form, multiCurrency: v })} />
      <div className="max-w-xs">
        <Select label={C.CORPORATE} value={form.corporate} onChange={(e) => setForm({ ...form, corporate: e.target.value })}>
          {form.currencies.filter((c) => c.isoCode).map((c) => <option key={c.isoCode} value={c.isoCode}>{c.isoCode}</option>)}
        </Select>
      </div>
      <Table containerClassName="rounded-card border border-line">
        <TableHead><TableRow>
          <TableHeader>{C.CODE}</TableHeader><TableHeader>{C.NAME}</TableHeader><TableHeader numeric>{C.RATE(form.corporate)}</TableHeader>
          <TableHeader>{C.ACTIVE}</TableHeader><TableHeader><span className="sr-only">{COPY.COMMON.REMOVE}</span></TableHeader>
        </TableRow></TableHead>
        <TableBody>
          {form.currencies.map((c, i) => (
            <TableRow key={i}>
              <TableCell>{c.isNew
                ? <Input fieldSize="sm" aria-label={C.CODE} maxLength={3} value={c.isoCode} onChange={(e) => setRow(i, { isoCode: e.target.value.toUpperCase() })} />
                : <code>{c.isoCode}</code>}</TableCell>
              <TableCell><Input fieldSize="sm" aria-label={C.NAME} value={c.name} onChange={(e) => setRow(i, { name: e.target.value })} /></TableCell>
              <TableCell numeric>
                {c.isoCode === form.corporate ? "1" : <Input fieldSize="sm" aria-label={C.RATE(form.corporate)} type="number" step="any" min="0" value={c.rate} onChange={(e) => setRow(i, { rate: e.target.value })} />}
              </TableCell>
              <TableCell><Checkbox aria-label={C.ACTIVE} checked={c.active} onChange={(e) => setRow(i, { active: e.target.checked })} /></TableCell>
              <TableCell>{c.isNew && <IconButton icon={X} label={COPY.COMMON.REMOVE} variant="ghost" size="xs" onClick={() => setForm({ ...form, currencies: form.currencies.filter((_, j) => j !== i) })} />}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div><Button size="sm" variant="secondary" onClick={() => setForm({ ...form, currencies: [...form.currencies, { isoCode: "", name: "", rate: 1, active: true, isNew: true }] })}>
        <Plus aria-hidden="true" className="h-4 w-4" />{C.ADD}
      </Button></div>
    </div>
  );
}
