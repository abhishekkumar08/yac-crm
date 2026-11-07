import { useState } from "react";
import { Button, Modal, Select } from "@kasumi/ui";
import { Check } from "lucide-react";
import { COPY } from "@/copy.js";

const CLOSED = { opportunity: ["Closed Won", "Closed Lost"], lead: ["Closed - Converted", "Closed - Not Converted"] };

export default function PathBar({ meta, record, onChange, onConvert, busy }) {
  const field = meta.fields.find((f) => f.name === meta.pathField);
  const [selected, setSelected] = useState(null);
  const [closing, setClosing] = useState(null);
  if (!field?.picklist) return null;
  const closedValues = CLOSED[meta.name] ?? [];
  const steps = closedValues.length ? [...field.picklist.filter((v) => !closedValues.includes(v)), "__closed__"] : field.picklist;
  const value = record[field.name];
  const currentStep = closedValues.includes(value) ? "__closed__" : value;
  const currentIndex = steps.indexOf(currentStep);
  const target = selected ?? (currentIndex >= 0 && currentIndex < steps.length - 1 ? steps[currentIndex + 1] : null);
  const label = (s) => (s === "__closed__" ? (closedValues.includes(value) ? value : COPY.RECORD.CLOSED) : s);

  const commit = () => {
    if (!target) return;
    if (target === "__closed__") {
      if (meta.name === "lead" && onConvert && !record.is_converted) { onConvert(); return; }
      setClosing(closedValues[0]);
      return;
    }
    onChange(target);
    setSelected(null);
  };

  return (
    <nav aria-label={COPY.RECORD.PATH} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3 sm:flex-row sm:items-center">
      <ol className="flex flex-1 flex-wrap gap-1">
        {steps.map((s, i) => {
          const done = i < currentIndex;
          const current = i === currentIndex;
          const picked = selected === s;
          return (
            <li key={s} className="min-w-0 flex-1">
              <Button size="sm" variant={current ? "primary" : picked ? "outline" : done ? "secondary" : "ghost"}
                aria-current={current ? "step" : undefined} className="w-full justify-center truncate"
                onClick={() => setSelected(current ? null : s)}>
                {done && <Check aria-hidden="true" className="h-4 w-4" />}
                <span className="truncate">{label(s)}</span>
              </Button>
            </li>
          );
        })}
      </ol>
      {!target && currentStep === "__closed__" && meta.name !== "lead" && (
        <Button size="sm" variant="secondary" onClick={() => setClosing(value)}>{COPY.RECORD.CHANGE_CLOSED_STAGE}</Button>
      )}
      {target && !(meta.name === "lead" && record.is_converted) && (
        <Button size="sm" onClick={commit} loading={busy}>
          {target === "__closed__" && meta.name === "lead" ? COPY.RECORD.CONVERT
            : selected ? COPY.RECORD.MARK_COMPLETE(label(target)) : COPY.RECORD.MARK_STAGE_COMPLETE}
        </Button>
      )}
      <Modal open={Boolean(closing)} onClose={() => setClosing(null)} title={COPY.RECORD.CLOSED_STAGE} size="sm"
        footer={<div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setClosing(null)}>{COPY.COMMON.CANCEL}</Button>
          <Button onClick={() => { onChange(closing); setClosing(null); setSelected(null); }}>{COPY.COMMON.SAVE}</Button>
        </div>}>
        <Select label={field.label} value={closing ?? ""} onChange={(e) => setClosing(e.target.value)}>
          {closedValues.map((v) => <option key={v} value={v}>{v}</option>)}
        </Select>
      </Modal>
    </nav>
  );
}
