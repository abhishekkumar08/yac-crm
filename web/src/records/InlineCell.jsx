import { useState } from "react";
import { IconButton, useNotifications } from "@kasumi/ui";
import { Check, Pencil, X } from "lucide-react";
import { api } from "@/api.js";
import { COPY } from "@/copy.js";
import FieldValue from "@/records/FieldValue.jsx";
import FieldInput, { isEditable } from "@/records/FieldInput.jsx";

export default function InlineCell({ meta, field, record, onSaved }) {
  const { notify } = useNotifications();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(null);
  const [name, setName] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!editing) {
    return (
      <div className="group flex items-center gap-1">
        <div className="min-w-0 flex-1 truncate"><FieldValue field={field} record={record} /></div>
        {isEditable(field) && (
          <IconButton icon={Pencil} label={COPY.LIST.INLINE_EDIT(field.label)} variant="ghost" size="xs"
            className="opacity-0 focus:opacity-100 group-hover:opacity-100"
            onClick={() => { setValue(record[field.name]); setName(record.$names?.[field.name] ?? null); setError(null); setEditing(true); }} />
        )}
      </div>
    );
  }

  const save = () => {
    setBusy(true);
    api(`/records/${meta.name}/${record.id}`, { method: "PATCH", body: { [field.name]: value } }).then(
      (saved) => { setBusy(false); setEditing(false); onSaved(saved); },
      (err) => { setBusy(false); setError(err.fields?.[field.name] ?? err.message); if (!err.fields?.[field.name]) notify(err.message, "error"); },
    );
  };

  return (
    <div className="flex min-w-48 items-start gap-1" onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); if (e.key === "Enter" && field.type !== "textarea") { e.preventDefault(); save(); } }}>
      <div className="flex-1">
        <FieldInput field={{ ...field, label: "" }} value={value} names={{ [field.name]: name }} error={error}
          onChange={(_, v, n) => { setValue(v); if (n !== undefined) setName(n); }} />
      </div>
      <IconButton icon={Check} label={COPY.COMMON.SAVE} size="xs" onClick={save} loading={busy} />
      <IconButton icon={X} label={COPY.COMMON.CANCEL} variant="ghost" size="xs" onClick={() => setEditing(false)} />
    </div>
  );
}
