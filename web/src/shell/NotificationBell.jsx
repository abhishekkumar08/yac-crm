import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, IconButton, Popover } from "@kasumi/ui";
import { Bell } from "lucide-react";
import { api } from "@/api.js";
import { COPY } from "@/copy.js";
import { formatDateTime } from "@/format.js";

const POLL_MS = 60000;

export default function NotificationBell() {
  const navigate = useNavigate();
  const [data, setData] = useState({ items: [], unread: 0 });
  const [open, setOpen] = useState(false);
  const load = useCallback(() => api("/notifications").then(setData, () => {}), []);
  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);
  const markAll = () => api("/notifications/read", { method: "POST", body: {} }).then(load, () => {});
  const go = (n) => {
    setOpen(false);
    api("/notifications/read", { method: "POST", body: { ids: [n.id] } }).then(load, () => {});
    if (n.link) navigate(n.link);
  };
  const trigger = (
    <span className="relative inline-flex">
      <IconButton icon={Bell} label={COPY.SHELL.NOTIFICATIONS} variant="ghost" size="sm" />
      {data.unread > 0 && <Badge size="count" tone="error" className="pointer-events-none absolute -right-1 -top-1">{data.unread}</Badge>}
    </span>
  );
  return (
    <Popover trigger={trigger} open={open} onOpenChange={(o) => { setOpen(o); if (o) load(); }} align="end"
      label={COPY.SHELL.NOTIFICATIONS} panelClassName="w-80 max-h-96 overflow-y-auto p-2">
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-label text-fg">{COPY.SHELL.NOTIFICATIONS}</span>
        {data.unread > 0 && <Button variant="link" size="xs" onClick={markAll}>{COPY.SHELL.MARK_ALL_READ}</Button>}
      </div>
      {data.items.length === 0 && <p className="p-2 text-caption text-fg-muted">{COPY.SHELL.NOTIFICATIONS_EMPTY}</p>}
      {data.items.map((n) => (
        <Button key={n.id} variant="ghost" size="sm" className={`h-auto w-full flex-col items-start py-2 text-left ${n.read ? "" : "bg-accent-subtle"}`} onClick={() => go(n)}>
          <span className="text-label text-fg">{n.title}</span>
          {n.body && <span className="line-clamp-2 text-caption text-fg-muted">{n.body}</span>}
          <span className="text-caption text-fg-muted">{formatDateTime(n.createdAt)}</span>
        </Button>
      ))}
    </Popover>
  );
}
