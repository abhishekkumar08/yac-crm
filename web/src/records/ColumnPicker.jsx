import { Button, Checkbox, Popover } from "@kasumi/ui";
import { Columns3 } from "lucide-react";
import { COPY } from "@/copy.js";

export default function ColumnPicker({ fields, columns, onChange }) {
  const toggle = (name, on) => onChange(on ? [...columns, name] : columns.filter((c) => c !== name));
  return (
    <Popover label={COPY.LIST.COLUMNS} align="end" panelClassName="max-h-80 w-64 overflow-y-auto p-3"
      trigger={<Button variant="secondary" size="sm"><Columns3 aria-hidden="true" className="h-4 w-4" />{COPY.LIST.COLUMNS}</Button>}>
      <div className="flex flex-col gap-1">
        {fields.filter((f) => f.type !== "textarea").map((f) => (
          <Checkbox key={f.name} label={f.label} checked={columns.includes(f.name)} onChange={(e) => toggle(f.name, e.target.checked)} />
        ))}
      </div>
    </Popover>
  );
}
