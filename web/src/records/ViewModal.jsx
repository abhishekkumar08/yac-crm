import { useEffect, useState } from "react";
import { Button, Checkbox, Input, Modal } from "@kasumi/ui";
import { COPY } from "@/copy.js";

export default function ViewModal({ open, onClose, onSave, initialName = "", initialShared = true, busy, title }) {
  const [name, setName] = useState(initialName);
  const [shared, setShared] = useState(initialShared);
  useEffect(() => { if (open) { setName(initialName); setShared(initialShared); } }, [open, initialName, initialShared]);
  const footer = (
    <div className="flex justify-end gap-2">
      <Button variant="secondary" onClick={onClose}>{COPY.COMMON.CANCEL}</Button>
      <Button onClick={() => onSave({ name: name.trim(), shared })} disabled={!name.trim()} loading={busy}>{COPY.COMMON.SAVE}</Button>
    </div>
  );
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm" footer={footer}>
      <form className="flex flex-col gap-stack" onSubmit={(e) => { e.preventDefault(); if (name.trim()) onSave({ name: name.trim(), shared }); }}>
        <Input label={COPY.LIST.VIEW_NAME} value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        <Checkbox label={COPY.LIST.VIEW_SHARED} checked={shared} onChange={(e) => setShared(e.target.checked)} />
      </form>
    </Modal>
  );
}
