import { newId, now } from "./db.js";

const LIMIT = 30;

export function notify(db, userId, { type, title, body = null, link = null }) {
  if (!userId) return;
  db.prepare("INSERT INTO notifications (id, user_id, type, title, body, link, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(newId("0Ml"), userId, type, title, body, link, now());
}

export function listNotifications(ctx) {
  const items = ctx.db.prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?")
    .all(ctx.user.id, LIMIT)
    .map((n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, link: n.link, createdAt: n.created_at, read: Boolean(n.read_at) }));
  const unread = ctx.db.prepare("SELECT count(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL").get(ctx.user.id).n;
  return { items, unread };
}

export function markRead(ctx, ids) {
  if (ids?.length) {
    const marks = ids.map(() => "?").join(", ");
    ctx.db.prepare(`UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL AND id IN (${marks})`).run(now(), ctx.user.id, ...ids);
  } else {
    ctx.db.prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL").run(now(), ctx.user.id);
  }
}
