import { useEffect, useState } from "react";
import { Alert, Badge, Button, Checkbox, ErrorState, Input, LoadingTable, Modal, PageHeader, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, useNotifications } from "@kasumi/ui";
import { Plus } from "lucide-react";
import { api } from "@/api.js";
import { COPY } from "@/copy.js";
import { useApi, useSession } from "@/hooks.js";

function UserModal({ user, roles, open, onClose, onSaved }) {
  const { currency } = useSession();
  const [form, setForm] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) { setError(null); setForm(user ? { ...user, password: "" } : { name: "", email: "", roleId: roles[0]?.id ?? "", profile: "standard", active: true, password: "" }); }
  }, [open, user, roles]);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const save = () => {
    const body = { name: form.name, email: form.email, roleId: form.roleId || null, profile: form.profile, active: form.active, defaultCurrency: form.defaultCurrency || null };
    if (!user || form.password) body.password = form.password;
    setBusy(true);
    const req = user ? api(`/users/${user.id}`, { method: "PATCH", body }) : api("/users", { method: "POST", body });
    req.then(() => { setBusy(false); onSaved(); }, (err) => { setBusy(false); setError(err.message); });
  };
  return (
    <Modal open={open} onClose={onClose} title={user ? user.name : COPY.SETUP.NEW_USER} footer={
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>{COPY.COMMON.CANCEL}</Button>
        <Button onClick={save} loading={busy}>{COPY.COMMON.SAVE}</Button>
      </div>}>
      <div className="flex flex-col gap-stack">
        {error && <Alert tone="error">{error}</Alert>}
        <Input label={COPY.SETUP.USER_NAME} value={form.name ?? ""} onChange={set("name")} required />
        <Input label={COPY.SETUP.USER_EMAIL} type="email" value={form.email ?? ""} onChange={set("email")} required />
        <Select label={COPY.SETUP.USER_ROLE} value={form.roleId ?? ""} onChange={set("roleId")}>
          <option value="">{COPY.COMMON.NONE}</option>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
        <Select label={COPY.SETUP.USER_PROFILE} value={form.profile ?? "standard"} onChange={set("profile")}>
          {Object.entries(COPY.SETUP.PROFILES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        {currency?.multiCurrency && (
          <Select label={COPY.SETUP.CURRENCY.DEFAULT} value={form.defaultCurrency ?? ""} onChange={set("defaultCurrency")}>
            <option value="">{currency.corporate}</option>
            {currency.currencies.filter((c) => c.active && c.isoCode !== currency.corporate).map((c) => <option key={c.isoCode} value={c.isoCode}>{c.isoCode}</option>)}
          </Select>
        )}
        <Input label={COPY.SETUP.USER_PASSWORD} type="password" autoComplete="new-password" hint={COPY.SETUP.USER_PASSWORD_HINT} value={form.password ?? ""} onChange={set("password")} required={!user} />
        <Checkbox label={COPY.SETUP.USER_ACTIVE} checked={Boolean(form.active)} onChange={set("active")} />
      </div>
    </Modal>
  );
}

export default function Users() {
  const { notify } = useNotifications();
  const users = useApi("/users?all=1");
  const roles = useApi("/roles");
  const [editing, setEditing] = useState(null);
  const error = users.error ?? roles.error;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={COPY.SETUP.USERS} subtitle={COPY.SETUP.USERS_SUBTITLE}
        action={<Button onClick={() => setEditing("new")}><Plus aria-hidden="true" className="h-4 w-4" />{COPY.SETUP.NEW_USER}</Button>} />
      {error && <ErrorState message={error.message} onRetry={() => { users.reload(); roles.reload(); }} retryLabel={COPY.COMMON.RETRY} />}
      {!users.data && !error && <LoadingTable rows={5} cols={5} />}
      {users.data && (
        <Table containerClassName="rounded-card border border-line">
          <TableHead><TableRow>
            <TableHeader>{COPY.SETUP.USER_NAME}</TableHeader><TableHeader>{COPY.SETUP.USER_EMAIL}</TableHeader>
            <TableHeader>{COPY.SETUP.USER_ROLE}</TableHeader><TableHeader>{COPY.SETUP.USER_PROFILE}</TableHeader><TableHeader>{COPY.SETUP.USER_ACTIVE}</TableHeader>
          </TableRow></TableHead>
          <TableBody>
            {users.data.map((u) => (
              <TableRow key={u.id} interactive onClick={() => setEditing(u)}>
                <TableCell><Button variant="link" size="xs" onClick={() => setEditing(u)}>{u.name}</Button></TableCell>
                <TableCell>{u.email}</TableCell><TableCell>{u.roleName}</TableCell><TableCell>{COPY.SETUP.PROFILES[u.profile]}</TableCell>
                <TableCell>{u.active ? COPY.COMMON.YES : <Badge tone="warning">{COPY.COMMON.NO}</Badge>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <UserModal user={editing === "new" ? null : editing} roles={roles.data ?? []} open={editing !== null} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); notify(COPY.SETUP.USER_SAVED, "success"); users.reload(); }} />
    </div>
  );
}
