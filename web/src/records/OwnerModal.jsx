import { useEffect, useState } from "react";
import { Button, Modal, Select, useNotifications } from "@kasumi/ui";
import { api } from "@/api.js";
import { COPY } from "@/copy.js";

export default function OwnerModal({ open, onClose, onConfirm, busy, currentOwnerId }) {
  const { notify } = useNotifications();
  const [users, setUsers] = useState([]);
  const [ownerId, setOwnerId] = useState("");
  useEffect(() => {
    if (!open) return;
    setOwnerId(currentOwnerId ?? "");
    api("/users").then(setUsers, (err) => notify(err.message, "error"));
  }, [open, currentOwnerId, notify]);
  const footer = (
    <div className="flex justify-end gap-2">
      <Button variant="secondary" onClick={onClose} disabled={busy}>{COPY.COMMON.CANCEL}</Button>
      <Button onClick={() => onConfirm(ownerId, users.find((u) => u.id === ownerId)?.name)} loading={busy} disabled={!ownerId}>{COPY.COMMON.SAVE}</Button>
    </div>
  );
  return (
    <Modal open={open} onClose={onClose} title={COPY.COMMON.CHANGE_OWNER} size="sm" footer={footer}>
      <Select label={COPY.RECORD.OWNER_PROMPT} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
        <option value="" disabled>{COPY.COMMON.NONE}</option>
        {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
      </Select>
    </Modal>
  );
}
