import { useEffect, useState } from "react";
import { Alert, Button, ErrorState, IconButton, Input, List, ListRow, LoadingCard, Menu, Modal, PageHeader, Select, useNotifications, Badge } from "@kasumi/ui";
import { MoreVertical, Plus } from "lucide-react";
import { api } from "@/api.js";
import { COPY } from "@/copy.js";
import { dangerConfirm } from "@/confirm.js";
import { useApi } from "@/hooks.js";

function flatten(roles, parentId = null, depth = 0) {
  return roles.filter((r) => (r.parentId ?? null) === parentId)
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((r) => [{ ...r, depth }, ...flatten(roles, r.id, depth + 1)]);
}

function RoleModal({ role, roles, open, onClose, onSaved }) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setName(role?.name ?? ""); setParentId(role?.parentId ?? ""); setError(null); } }, [open, role]);
  const save = () => {
    setBusy(true);
    const body = { name, parentId: parentId || null };
    const req = role ? api(`/roles/${role.id}`, { method: "PATCH", body }) : api("/roles", { method: "POST", body });
    req.then(() => { setBusy(false); onSaved(); }, (err) => { setBusy(false); setError(err.message); });
  };
  return (
    <Modal open={open} onClose={onClose} size="sm" title={role ? role.name : COPY.SETUP.NEW_ROLE} footer={
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>{COPY.COMMON.CANCEL}</Button>
        <Button onClick={save} loading={busy} disabled={!name.trim()}>{COPY.COMMON.SAVE}</Button>
      </div>}>
      <div className="flex flex-col gap-stack">
        {error && <Alert tone="error">{error}</Alert>}
        <Input label={COPY.SETUP.ROLE_NAME} value={name} onChange={(e) => setName(e.target.value)} required />
        <Select label={COPY.SETUP.ROLE_PARENT} value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">{COPY.SETUP.ROLE_TOP}</option>
          {roles.filter((r) => r.id !== role?.id).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
      </div>
    </Modal>
  );
}

export default function Roles() {
  const { notify, confirmAction } = useNotifications();
  const { data, error, loading, reload } = useApi("/roles");
  const [editing, setEditing] = useState(null);
  const remove = async (r) => {
    if (!(await confirmAction(dangerConfirm(COPY.COMMON.DELETE, r.name)))) return;
    api(`/roles/${r.id}`, { method: "DELETE" }).then(() => { notify(COPY.SETUP.ROLE_DELETED, "success"); reload(); }, (err) => notify(err.message, "error"));
  };
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={COPY.SETUP.ROLES} subtitle={COPY.SETUP.ROLES_SUBTITLE}
        action={<Button onClick={() => setEditing("new")}><Plus aria-hidden="true" className="h-4 w-4" />{COPY.SETUP.NEW_ROLE}</Button>} />
      {error && <ErrorState message={error.message} onRetry={reload} retryLabel={COPY.COMMON.RETRY} />}
      {loading && !data && <LoadingCard />}
      {data && (
        <List>
          {flatten(data).map((r) => (
            <ListRow key={r.id} title={<span style={{ paddingLeft: `${r.depth * 1.5}rem` }}>{r.name}</span>}
              meta={<Badge size="count">{r.users}</Badge>}
              trailing={<Menu label={COPY.COMMON.EDIT} align="end" trigger={<IconButton icon={MoreVertical} label={`${COPY.COMMON.EDIT} ${r.name}`} variant="ghost" size="xs" />}
                items={[{ label: COPY.COMMON.EDIT, onSelect: () => setEditing(r) }, { label: COPY.COMMON.DELETE, tone: "danger", onSelect: () => remove(r) }]} />} />
          ))}
        </List>
      )}
      <RoleModal role={editing === "new" ? null : editing} roles={data ?? []} open={editing !== null} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); notify(COPY.SETUP.ROLE_SAVED, "success"); reload(); }} />
    </div>
  );
}
