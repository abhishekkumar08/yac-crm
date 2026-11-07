import { Checkbox, Input, Select, Textarea } from "@kasumi/ui";
import { COPY } from "@/copy.js";
import { pad } from "@/format.js";
import { COMPUTED_TYPES } from "@shared/field-types.js";
import LookupInput from "@/records/LookupInput.jsx";
import FieldValue from "@/records/FieldValue.jsx";

const toLocal = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocal = (v) => (v ? new Date(v).toISOString() : null);

export const isEditable = (field) => !field.system && !field.readonly && !COMPUTED_TYPES.has(field.type);

export default function FieldInput({ field, value, names = {}, onChange, error, record }) {
  const label = field.label;
  const common = { label, error, required: field.required, hint: field.help || undefined };
  if (!isEditable(field)) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-label text-fg">{label}</span>
        <div className="text-body">{record ? <FieldValue field={field} record={record} /> : COPY.RECORD.READ_ONLY}</div>
      </div>
    );
  }
  const set = (v) => onChange(field.name, v);
  switch (field.type) {
    case "textarea":
      return <Textarea {...common} rows={3} value={value ?? ""} onChange={(e) => set(e.target.value)} />;
    case "number": case "currency": case "percent":
      return <Input {...common} type="number" step="any" inputMode="decimal" value={value ?? ""} onChange={(e) => set(e.target.value)} />;
    case "date":
      return <Input {...common} type="date" value={value ?? ""} onChange={(e) => set(e.target.value || null)} />;
    case "datetime":
      return <Input {...common} type="datetime-local" value={toLocal(value)} onChange={(e) => set(fromLocal(e.target.value))} />;
    case "checkbox":
      return <Checkbox label={label} checked={Boolean(value)} onChange={(e) => set(e.target.checked)} description={error} />;
    case "picklist":
      return (
        <Select {...common} value={value ?? ""} onChange={(e) => set(e.target.value || null)}>
          <option value="">{COPY.COMMON.NONE}</option>
          {(field.picklist ?? []).map((v) => <option key={v} value={v}>{v}</option>)}
        </Select>
      );
    case "multipicklist": {
      const list = Array.isArray(value) ? value : [];
      return (
        <fieldset className="flex flex-col gap-1">
          <legend className="text-label text-fg">{label}</legend>
          {(field.picklist ?? []).map((v) => (
            <Checkbox key={v} label={v} checked={list.includes(v)}
              onChange={(e) => set(e.target.checked ? [...list, v] : list.filter((x) => x !== v))} />
          ))}
          {error && <span className="text-caption text-error-fg">{error}</span>}
        </fieldset>
      );
    }
    case "lookup":
      return <LookupInput field={field} label={label} required={field.required} error={error} value={value}
        name={names[field.name]} onChange={(id, name) => onChange(field.name, id, name)} />;
    case "email":
      return <Input {...common} type="email" value={value ?? ""} onChange={(e) => set(e.target.value)} />;
    case "phone":
      return <Input {...common} type="tel" value={value ?? ""} onChange={(e) => set(e.target.value)} />;
    case "url":
      return <Input {...common} type="url" value={value ?? ""} onChange={(e) => set(e.target.value)} />;
    default:
      return <Input {...common} value={value ?? ""} onChange={(e) => set(e.target.value)} />;
  }
}

