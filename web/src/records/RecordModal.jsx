import { useEffect, useState } from "react";
import { Button, Modal, useNotifications } from "@kasumi/ui";
import { api } from "@/api.js";
import { COPY } from "@/copy.js";
import RecordForm from "@/records/RecordForm.jsx";
import { isEditable } from "@/records/FieldInput.jsx";

function initialValues(meta, record, initial) {
  const values = {};
  for (const f of meta.fields) {
    if (!isEditable(f)) continue;
    if (record) values[f.name] = record[f.name] ?? null;
    else if (initial?.[f.name] !== undefined) values[f.name] = initial[f.name];
    else if (f.defaultValue !== null && f.defaultValue !== undefined) {
      values[f.name] = f.type === "checkbox" ? f.defaultValue === "true" : f.defaultValue;
    } else values[f.name] = f.type === "checkbox" ? false : null;
  }
  return values;
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export default function RecordModal({ meta, record, initial, initialNames, open, onClose, onSaved }) {
  const { notify } = useNotifications();
  const [values, setValues] = useState({});
  const [names, setNames] = useState({});
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !meta) return;
    setValues(initialValues(meta, record, initial));
    setNames({ ...(record?.$names ?? {}), ...(initialNames ?? {}) });
    setErrors({});
  }, [open, meta, record, initial, initialNames]);

  if (!meta) return null;

  const onChange = (name, value, label) => {
    setValues((v) => ({ ...v, [name]: value }));
    if (label !== undefined) setNames((n) => ({ ...n, [name]: label }));
    setErrors((e) => ({ ...e, [name]: undefined }));
  };

  const save = (andNew) => {
    const body = record
      ? Object.fromEntries(Object.entries(values).filter(([k, v]) => !same(v, record[k])))
      : Object.fromEntries(Object.entries(values).filter(([, v]) => v !== null && v !== ""));
    setBusy(true);
    const request = record
      ? api(`/records/${meta.name}/${record.id}`, { method: "PATCH", body })
      : api(`/records/${meta.name}`, { method: "POST", body });
    request.then(
      (saved) => {
        setBusy(false);
        notify(record ? COPY.RECORD.SAVED(meta.label) : COPY.RECORD.CREATED(meta.label, saved.name ?? ""), "success");
        onSaved?.(saved, { andNew });
        if (andNew) {
          setValues(initialValues(meta, null, initial));
          setNames(initialNames ?? {});
        }
      },
      (err) => {
        setBusy(false);
        if (err.fields) setErrors(err.fields);
        notify(err.fields ? COPY.RECORD.FIX_ERRORS : err.message, "error");
      },
    );
  };

  const footer = (
    <div className="flex justify-end gap-2">
      <Button variant="secondary" onClick={onClose} disabled={busy}>{COPY.COMMON.CANCEL}</Button>
      {!record && <Button variant="secondary" onClick={() => save(true)} disabled={busy}>{COPY.COMMON.SAVE_NEW}</Button>}
      <Button onClick={() => save(false)} loading={busy}>{COPY.COMMON.SAVE}</Button>
    </div>
  );

  return (
    <Modal open={open} onClose={busy ? undefined : onClose} size="lg" footer={footer}
      title={record ? COPY.RECORD.EDIT_TITLE(record.name ?? meta.label) : COPY.RECORD.NEW_TITLE(meta.label)}>
      <form onSubmit={(e) => { e.preventDefault(); save(false); }} noValidate>
        <RecordForm meta={meta} values={values} names={names} errors={errors} onChange={onChange} record={record} />
      </form>
    </Modal>
  );
}
