import { useEffect, useState } from "react";
import { Alert, Button, Checkbox, Input, Modal, Select, Textarea, useNotifications } from "@kasumi/ui";
import { api } from "@/api.js";
import { COPY } from "@/copy.js";
import { COMPUTED_TYPES, FIELD_TYPES as TYPES, FORMULA_RETURN_TYPES as RETURN_TYPES, NUMERIC_TYPES, displayType } from "@shared/field-types.js";
import { useObjectMeta, useSession } from "@/hooks.js";

const TYPE_LABELS = COPY.SETUP.TYPE_LABELS;

function RollupFields({ object, rollup, onChange }) {
  const { objects } = useSession();
  const { meta: child } = useObjectMeta(rollup.child || null);
  const vias = child?.fields.filter((f) => f.type === "lookup" && !f.system && String(f.referenceTo).split(",").includes(object)) ?? [];
  const numeric = child?.fields.filter((f) => f.type !== "rollup" && NUMERIC_TYPES.has(displayType(f))) ?? [];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Select label={COPY.SETUP.ROLLUP_CHILD} value={rollup.child ?? ""} onChange={(e) => onChange({ ...rollup, child: e.target.value, via: "" })}>
        <option value="">{COPY.COMMON.NONE}</option>
        {objects.map((o) => <option key={o.name} value={o.name}>{o.label}</option>)}
      </Select>
      <Select label={COPY.SETUP.ROLLUP_VIA} value={rollup.via ?? ""} onChange={(e) => onChange({ ...rollup, via: e.target.value })} disabled={!vias.length}>
        <option value="">{COPY.COMMON.NONE}</option>
        {vias.map((f) => <option key={f.name} value={f.name}>{f.label}</option>)}
      </Select>
      <Select label={COPY.SETUP.ROLLUP_FN} value={rollup.fn} onChange={(e) => onChange({ ...rollup, fn: e.target.value })}>
        {Object.entries(COPY.REPORTS.FN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </Select>
      {rollup.fn !== "count" && (
        <Select label={COPY.SETUP.ROLLUP_FIELD} value={rollup.field ?? ""} onChange={(e) => onChange({ ...rollup, field: e.target.value })}>
          <option value="">{COPY.COMMON.NONE}</option>
          {numeric.map((f) => <option key={f.name} value={f.name}>{f.label}</option>)}
        </Select>
      )}
      <div className="md:col-span-2"><Input label={COPY.SETUP.ROLLUP_FILTER} value={rollup.filter ?? ""} onChange={(e) => onChange({ ...rollup, filter: e.target.value })} /></div>
    </div>
  );
}

const blankField = { label: "", type: "text", required: false, unique: false, searchable: false, help: "", defaultValue: "",
  picklistText: "", referenceTo: "", formula: "", returnType: "number", rollup: { child: "", via: "", fn: "count", field: "", filter: "" },
  autonumber: { format: "{0000}" } };

export default function FieldEditor({ meta, field, open, onClose, onSaved }) {
  const { notify } = useNotifications();
  const { objects } = useSession();
  const [form, setForm] = useState(blankField);
  const [error, setError] = useState(null);
  const [syntax, setSyntax] = useState(null);
  const [busy, setBusy] = useState(false);
  const isNew = !field;

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSyntax(null);
    setForm(field ? {
      ...blankField, ...field, help: field.help ?? "", defaultValue: field.defaultValue ?? "",
      picklistText: (field.picklist ?? []).join("\n"), referenceTo: field.referenceTo ?? "", formula: field.formula ?? "",
      returnType: field.returnType ?? "number", rollup: { ...blankField.rollup, ...(field.rollup ?? {}) },
      autonumber: field.autonumber ?? blankField.autonumber,
    } : blankField);
  }, [open, field]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const checkSyntax = () => api("/meta/expr/check", { method: "POST", body: { object: meta.name, formula: form.formula } })
    .then((r) => setSyntax(r), (err) => setSyntax({ ok: false, error: err.message }));

  const save = () => {
    const body = {
      label: form.label, required: form.required, unique: form.unique, searchable: form.searchable,
      help: form.help || null, defaultValue: form.defaultValue || null,
    };
    if (isNew) body.type = form.type;
    if (["picklist", "multipicklist"].includes(form.type)) body.picklist = form.picklistText.split("\n").map((s) => s.trim()).filter(Boolean);
    if (form.type === "lookup") body.referenceTo = form.referenceTo;
    if (form.type === "formula") { body.formula = form.formula; body.returnType = form.returnType; }
    if (form.type === "rollup") body.rollup = { ...form.rollup, filter: form.rollup.filter || null };
    if (form.type === "autonumber") body.autonumber = { format: form.autonumber.format, next: form.autonumber.next ?? 1 };
    setBusy(true);
    const req = isNew
      ? api(`/meta/objects/${meta.name}/fields`, { method: "POST", body })
      : api(`/meta/objects/${meta.name}/fields/${field.name}`, { method: "PATCH", body });
    req.then(
      () => { setBusy(false); notify(COPY.SETUP.FIELD_SAVED, "success"); onSaved(); },
      (err) => { setBusy(false); setError(err.message); },
    );
  };

  const computed = COMPUTED_TYPES.has(form.type);
  return (
    <Modal open={open} onClose={onClose} size="lg" title={isNew ? COPY.SETUP.NEW_FIELD : COPY.SETUP.EDIT_FIELD} footer={
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>{COPY.COMMON.CANCEL}</Button>
        <Button onClick={save} loading={busy} disabled={!form.label.trim()}>{COPY.COMMON.SAVE}</Button>
      </div>}>
      <div className="flex flex-col gap-stack">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid gap-4 md:grid-cols-2">
          <Input label={COPY.SETUP.FIELD_LABEL} value={form.label} onChange={(e) => set("label", e.target.value)} required />
          <Select label={COPY.SETUP.FIELD_TYPE} value={form.type} onChange={(e) => set("type", e.target.value)} disabled={!isNew}>
            {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </Select>
        </div>
        {["picklist", "multipicklist"].includes(form.type) && (
          <Textarea label={COPY.SETUP.PICKLIST_VALUES} rows={5} value={form.picklistText} onChange={(e) => set("picklistText", e.target.value)} />
        )}
        {form.type === "lookup" && (
          <Select label={COPY.SETUP.REFERENCE} value={form.referenceTo} onChange={(e) => set("referenceTo", e.target.value)} disabled={!isNew}>
            <option value="">{COPY.COMMON.NONE}</option>
            {objects.map((o) => <option key={o.name} value={o.name}>{o.label}</option>)}
          </Select>
        )}
        {form.type === "formula" && (
          <>
            <Select label={COPY.SETUP.RETURN_TYPE} value={form.returnType} onChange={(e) => set("returnType", e.target.value)}>
              {RETURN_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </Select>
            <Textarea label={COPY.SETUP.FORMULA} hint={COPY.SETUP.FORMULA_HINT} rows={4} className="font-mono"
              value={form.formula} onChange={(e) => { set("formula", e.target.value); setSyntax(null); }} />
            <div className="flex items-center gap-3">
              <Button size="sm" variant="secondary" onClick={checkSyntax}>{COPY.SETUP.CHECK_SYNTAX}</Button>
              {syntax && <Alert variant="inline" tone={syntax.ok ? "success" : "error"}>{syntax.ok ? COPY.SETUP.SYNTAX_OK : syntax.error}</Alert>}
            </div>
          </>
        )}
        {form.type === "rollup" && isNew && <RollupFields object={meta.name} rollup={form.rollup} onChange={(r) => set("rollup", r)} />}
        {form.type === "autonumber" && (
          <Input label={COPY.SETUP.AUTONUMBER_FORMAT} hint={COPY.SETUP.NAME_FORMAT_HINT} value={form.autonumber.format}
            onChange={(e) => set("autonumber", { ...form.autonumber, format: e.target.value })} />
        )}
        {!computed && form.type !== "checkbox" && (
          <Input label={COPY.SETUP.DEFAULT} value={form.defaultValue} onChange={(e) => set("defaultValue", e.target.value)} />
        )}
        <Input label={COPY.SETUP.HELP} value={form.help} onChange={(e) => set("help", e.target.value)} />
        {!computed && (
          <div className="flex flex-wrap gap-6">
            <Checkbox label={COPY.SETUP.REQUIRED} checked={form.required} onChange={(e) => set("required", e.target.checked)} />
            <Checkbox label={COPY.SETUP.UNIQUE} checked={form.unique} onChange={(e) => set("unique", e.target.checked)} />
            <Checkbox label={COPY.SETUP.SEARCHABLE} checked={form.searchable} onChange={(e) => set("searchable", e.target.checked)} />
          </div>
        )}
      </div>
    </Modal>
  );
}
