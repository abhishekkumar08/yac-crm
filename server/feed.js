import { newId, now, tx } from "./db.js";
import { getObject, isAdmin } from "./metadata.js";
import { canRead } from "./sharing.js";
import { getRecord, resolveNames } from "./records.js";
import { notify } from "./notifications.js";

export class FeedError extends Error {}

const MAX_BODY = 10000;
const PAGE = 50;
const MENTION = /@\[([^\]]+)\]\(([^)\s]{1,40})\)/g;
const TRACKED = {
  opportunity: ["stage", "amount", "close_date"],
  case: ["status", "priority"],
  lead: ["status"],
};

const cleanBody = (body) => {
  const text = String(body ?? "").trim();
  if (!text) throw new FeedError("Write something first.");
  if (text.length > MAX_BODY) throw new FeedError(`Posts can be up to ${MAX_BODY} characters.`);
  return text;
};

const linkFor = (object, id) => `/r/${object}/${id}`;
const userName = (db, id) => db.prepare("SELECT name FROM users WHERE id = ?").get(id)?.name ?? "";

function follow(db, userId, recordId) {
  db.prepare("INSERT OR IGNORE INTO follows (user_id, record_id) VALUES (?, ?)").run(userId, recordId);
}

function userCanRead(db, userId, record) {
  const u = db.prepare("SELECT id, role_id, profile FROM users WHERE id = ? AND active = 1").get(userId);
  return Boolean(u) && canRead(db, { id: u.id, roleId: u.role_id, profile: u.profile }, record);
}

function mentionedUsers(db, text, record) {
  const ids = [...new Set([...text.matchAll(MENTION)].map((m) => m[2]))];
  return ids.filter((id) => userCanRead(db, id, record));
}

function recordMentions(ctx, itemId, text, record) {
  for (const userId of mentionedUsers(ctx.db, text, record)) {
    ctx.db.prepare("INSERT OR IGNORE INTO feed_mentions (item_id, user_id) VALUES (?, ?)").run(itemId, userId);
    if (userId !== ctx.user.id) {
      notify(ctx.db, userId, { type: "mention", title: `${userName(ctx.db, ctx.user.id)} mentioned you on ${record.name ?? ""}`,
        body: text.replace(MENTION, "@$1").slice(0, 200), link: linkFor(record.object, record.id) });
    }
  }
}

export function post(ctx, object, recordId, body) {
  const record = getRecord(ctx, object, recordId);
  const text = cleanBody(body);
  return tx(ctx.db, () => {
    const id = newId("0D5");
    ctx.db.prepare("INSERT INTO feed_items (id, record_id, object, type, body, created_by, created_at) VALUES (?, ?, ?, 'post', ?, ?, ?)")
      .run(id, recordId, object, text, ctx.user.id, now());
    follow(ctx.db, ctx.user.id, recordId);
    recordMentions(ctx, id, text, record);
    return itemById(ctx, id);
  });
}

function liveItem(ctx, itemId) {
  const row = ctx.db.prepare("SELECT * FROM feed_items WHERE id = ? AND deleted_at IS NULL").get(itemId);
  if (!row) throw new FeedError("That post was not found.");
  return row;
}

export function comment(ctx, itemId, body) {
  const item = liveItem(ctx, itemId);
  const record = getRecord(ctx, item.object, item.record_id);
  const text = cleanBody(body);
  return tx(ctx.db, () => {
    ctx.db.prepare("INSERT INTO feed_comments (id, item_id, body, created_by, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(newId("0D7"), itemId, text, ctx.user.id, now());
    recordMentions(ctx, itemId, text, record);
    if (item.created_by !== ctx.user.id && userCanRead(ctx.db, item.created_by, record)) {
      notify(ctx.db, item.created_by, { type: "comment", title: `${userName(ctx.db, ctx.user.id)} commented on your post`,
        body: text.replace(MENTION, "@$1").slice(0, 200), link: linkFor(item.object, item.record_id) });
    }
    return itemById(ctx, itemId);
  });
}

export function toggleLike(ctx, itemId) {
  const item = liveItem(ctx, itemId);
  getRecord(ctx, item.object, item.record_id);
  const had = ctx.db.prepare("SELECT 1 FROM feed_likes WHERE item_id = ? AND user_id = ?").get(itemId, ctx.user.id);
  if (had) ctx.db.prepare("DELETE FROM feed_likes WHERE item_id = ? AND user_id = ?").run(itemId, ctx.user.id);
  else ctx.db.prepare("INSERT INTO feed_likes (item_id, user_id) VALUES (?, ?)").run(itemId, ctx.user.id);
  return { liked: !had };
}

export function deleteItem(ctx, itemId) {
  const item = liveItem(ctx, itemId);
  if (item.created_by !== ctx.user.id && !isAdmin(ctx.user)) throw new FeedError("Only the author or an admin can delete this post.");
  ctx.db.prepare("UPDATE feed_items SET deleted_at = ? WHERE id = ?").run(now(), itemId);
}

function decorate(ctx, rows) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const marks = ids.map(() => "?").join(", ");
  const comments = ctx.db.prepare(`SELECT * FROM feed_comments WHERE deleted_at IS NULL AND item_id IN (${marks}) ORDER BY created_at, rowid`).all(...ids);
  const likes = new Map(ctx.db.prepare(`SELECT item_id, count(*) AS n FROM feed_likes WHERE item_id IN (${marks}) GROUP BY item_id`).all(...ids).map((r) => [r.item_id, r.n]));
  const mine = new Set(ctx.db.prepare(`SELECT item_id FROM feed_likes WHERE user_id = ? AND item_id IN (${marks})`).all(ctx.user.id, ...ids).map((r) => r.item_id));
  const names = resolveNames(ctx.db, [...rows.map((r) => r.created_by), ...rows.map((r) => r.record_id), ...comments.map((c) => c.created_by)]);
  return rows.map((r) => ({
    id: r.id, type: r.type, body: r.body, changes: r.changes ? JSON.parse(r.changes) : null, object: r.object,
    recordId: r.record_id, recordName: names.get(r.record_id) ?? null, authorId: r.created_by,
    authorName: names.get(r.created_by) ?? null, createdAt: r.created_at, likes: likes.get(r.id) ?? 0, likedByMe: mine.has(r.id),
    comments: comments.filter((c) => c.item_id === r.id).map((c) => ({ id: c.id, body: c.body, authorId: c.created_by,
      authorName: names.get(c.created_by) ?? null, createdAt: c.created_at })),
  }));
}

function itemById(ctx, id) {
  return decorate(ctx, [ctx.db.prepare("SELECT * FROM feed_items WHERE id = ?").get(id)])[0];
}

export function recordFeed(ctx, object, recordId) {
  getRecord(ctx, object, recordId);
  const rows = ctx.db.prepare(`SELECT * FROM feed_items WHERE record_id = ? AND deleted_at IS NULL
    ORDER BY created_at DESC, rowid DESC LIMIT ?`).all(recordId, PAGE);
  return decorate(ctx, rows);
}

const SCOPES = {
  following: [`(f.record_id IN (SELECT record_id FROM follows WHERE user_id = ?) OR f.created_by = ?)`, (u) => [u, u]],
  mentions: ["f.id IN (SELECT item_id FROM feed_mentions WHERE user_id = ?)", (u) => [u]],
  all: ["1 = 1", () => []],
};

export function feed(ctx, scope = "following") {
  const [where, params] = SCOPES[scope] ?? SCOPES.following;
  const rows = ctx.db.prepare(`SELECT f.*, r.owner_id, r.data FROM feed_items f JOIN records r ON r.id = f.record_id
    WHERE f.deleted_at IS NULL AND r.deleted_at IS NULL AND ${where} ORDER BY f.created_at DESC, f.rowid DESC LIMIT ?`)
    .all(...params(ctx.user.id), PAGE * 4);
  const visible = rows.filter((r) => canRead(ctx.db, ctx.user, { object: r.object, ownerId: r.owner_id, ...JSON.parse(r.data) }));
  return decorate(ctx, visible.slice(0, PAGE));
}

export function toggleFollow(ctx, object, recordId) {
  getRecord(ctx, object, recordId);
  if (isFollowing(ctx, recordId)) {
    ctx.db.prepare("DELETE FROM follows WHERE user_id = ? AND record_id = ?").run(ctx.user.id, recordId);
    return false;
  }
  follow(ctx.db, ctx.user.id, recordId);
  return true;
}

export const isFollowing = (ctx, recordId) => Boolean(ctx.db.prepare("SELECT 1 FROM follows WHERE user_id = ? AND record_id = ?").get(ctx.user.id, recordId));

export function afterRecordSave(ctx, meta, before, after) {
  if (!before) {
    follow(ctx.db, ctx.user.id, after.id);
    return;
  }
  const byName = new Map(getObject(ctx.db, meta.name).fields.map((f) => [f.name, f]));
  const changes = [];
  for (const name of TRACKED[meta.name] ?? []) {
    if (JSON.stringify(before[name] ?? null) !== JSON.stringify(after[name] ?? null)) {
      changes.push({ field: name, label: byName.get(name)?.label ?? name, from: before[name] ?? null, to: after[name] ?? null });
    }
  }
  if (before.ownerId !== after.ownerId) {
    const names = resolveNames(ctx.db, [before.ownerId, after.ownerId]);
    changes.push({ field: "owner", label: "Owner", from: names.get(before.ownerId) ?? null, to: names.get(after.ownerId) ?? null });
    if (after.ownerId !== ctx.user.id) {
      notify(ctx.db, after.ownerId, { type: "owner", title: `${userName(ctx.db, ctx.user.id)} assigned you ${after.name ?? meta.label}`,
        link: linkFor(meta.name, after.id) });
    }
  }
  if (!changes.length) return;
  ctx.db.prepare(`INSERT INTO feed_items (id, record_id, object, type, changes, created_by, created_at) VALUES (?, ?, ?, 'tracked', ?, ?, ?)`)
    .run(newId("0D5"), after.id, meta.name, JSON.stringify(changes), ctx.user.id, now());
}
