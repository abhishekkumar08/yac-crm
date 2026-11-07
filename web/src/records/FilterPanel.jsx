import { Button, IconButton, Input, Select } from "@kasumi/ui";
import { Plus, X } from "lucide-react";
import { COPY } from "@/copy.js";
import { displayType } from "@/format.js";

const NO_VALUE = new Set(["blank", "notblank"]);

function opsFor(field) {
  const t = displayType(field);
  if (["number", "currency", "percent", "date", "datetime"].includes(t)) return ["eq", "ne", "gt", "gte", "lt", "lte", "blank", "notblank"];
  if (t === "checkbox") return ["eq"];
  if (t === "picklist" || t === "multipicklist") return ["eq", "ne", "in", "blank", "notblank"];
  if (t === "lookup") return ["eq", "ne", "blank", "notblank"];
  return ["eq", "ne", "contains", "starts", "blank", "notblank"];
}

function ValueInput({ field, filter, onChange }) {
  const t = displayType(field);
  const label = COPY.LIST.VALUE;
  if (t === "checkbox") {
    return (
      <Select fieldSize="sm" aria-label={label} value={String(filter.value ?? true)} onChange={(e) => onChange(e.target.value === "true")}>
        <option value="true">{COPY.COMMON.YES}</option>
        <option value="false">{COPY.COMMON.NO}</option>
      </Select>
    );
  }
  if ((t === "picklist" || t === "multipicklist") && filter.op !== "in") {
    return (
      <Select fieldSize="sm" aria-label={label} value={filter.value ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">{COPY.COMMON.NONE}</option>
        {field.picklist.map((v) => <option key={v} value={v}>{v}</option>)}
      </Select>
    );
  }
  if (t === "date" || t === "datetime") {
    return (
      <>
        <Input fieldSize="sm" aria-label={label} list="crm-date-literals" title={COPY.LIST.DATE_HINT}
          placeholder="THIS_MONTH" value={filter.value ?? ""} onChange={(e) => onChange(e.target.value)} />
        <datalist id="crm-date-literals">{COPY.LIST.DATE_LITERALS.map((d) => <option key={d} value={d} />)}</datalist>
      </>
    );
  }
  const numeric = ["number", "currency", "percent"].includes(t);
  return <Input fieldSize="sm" aria-label={label} type={numeric ? "number" : "text"} value={filter.value ?? ""} onChange={(e) => onChange(e.target.value)} />;
}

export default function FilterPanel({ fields, filters, onChange }) {
  const filterable = fields.filter((f) => !["textarea"].includes(f.type));
  const byName = new Map(fields.map((f) => [f.name, f]));
  const update = (i, patch) => onChange(filters.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const add = () => {
    const first = filterable[0];
    onChange([...filters, { field: first.name, op: opsFor(first)[0], value: displayType(first) === "checkbox" ? true : "" }]);
  };
  return (
    <div className="flex flex-col gap-3">
      {filters.length === 0 && <p className="text-caption text-fg-muted">{COPY.LIST.NO_FILTERS}</p>}
      {filters.map((flt, i) => {
        const field = byName.get(flt.field) ?? filterable[0];
        return (
          <div key={i} className="flex flex-wrap items-center gap-2 rounded-control border border-line p-2">
            <Select fieldSize="sm" aria-label={COPY.LIST.FIELD} value={flt.field} className="min-w-40"
              onChange={(e) => { const f = byName.get(e.target.value); update(i, { field: f.name, op: opsFor(f)[0], value: displayType(f) === "checkbox" ? true : "" }); }}>
              {filterable.map((f) => <option key={f.name} value={f.name}>{f.label}</option>)}
            </Select>
            <Select fieldSize="sm" aria-label={COPY.LIST.OPERATOR} value={flt.op} onChange={(e) => update(i, { op: e.target.value })}>
              {opsFor(field).map((op) => <option key={op} value={op}>{COPY.LIST.OPS[op]}</option>)}
            </Select>
            {!NO_VALUE.has(flt.op) && <div className="min-w-40 flex-1"><ValueInput field={field} filter={flt} onChange={(value) => update(i, { value })} /></div>}
            <IconButton icon={X} label={COPY.COMMON.REMOVE} variant="ghost" size="sm" onClick={() => onChange(filters.filter((_, j) => j !== i))} />
          </div>
        );
      })}
      <div><Button variant="secondary" size="sm" onClick={add}><Plus aria-hidden="true" className="h-4 w-4" />{COPY.LIST.ADD_FILTER}</Button></div>
    </div>
  );
}
