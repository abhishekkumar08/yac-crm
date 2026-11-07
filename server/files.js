import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { newId, now, tx } from "./db.js";
import { canEdit } from "./sharing.js";
import { getRecord, ForbiddenError, NotFoundError } from "./records.js";

export class FileError extends Error {}

export const MAX_BYTES = 10 * 1024 * 1024;
const MAX_NAME = 200;
let filesDir = null;

export function setFilesDir(dir) {
  filesDir = resolve(dir);
  mkdirSync(dir, { recursive: true });
}

const printable = (s) => [...s].filter((ch) => ch.charCodeAt(0) >= 32).join("");
const MIME = /^[\w.+-]+\/[\w.+-]+$/;
const safeName = (name) => [...printable(basename(String(name ?? "").toWellFormed().replace(/\\/g, "/")))].slice(0, MAX_NAME).join("") || "file";
const safeType = (type) => (MIME.test(String(type ?? "")) ? String(type).slice(0, 100) : "application/octet-stream");

const fromRow = (r) => ({ id: r.id, recordId: r.record_id, object: r.object, name: r.name, type: r.type, size: r.size,
  ownerId: r.owner_id, ownerName: r.owner_name ?? null, createdAt: r.created_at });

export function addFile(ctx, object, recordId, { name, type, data }) {
  const record = getRecord(ctx, object, recordId);
  if (!canEdit(ctx.db, ctx.user, record)) throw new ForbiddenError("You can't add files to this record.");
  const bytes = Buffer.from(String(data ?? ""), "base64");
  if (!bytes.length) throw new FileError("The file is empty.");
  if (bytes.length > MAX_BYTES) throw new FileError("Files can be up to 10 MB.");
  const id = newId("069");
  tx(ctx.db, () => {
    ctx.db.prepare(`INSERT INTO files (id, record_id, object, name, type, size, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, recordId, object, safeName(name), safeType(type), bytes.length, ctx.user.id, now());
    writeFileSync(join(filesDir, id), bytes);
  });
  return fromRow(ctx.db.prepare("SELECT * FROM files WHERE id = ?").get(id));
}

export function listFiles(ctx, object, recordId) {
  getRecord(ctx, object, recordId);
  return ctx.db.prepare(`SELECT f.*, u.name AS owner_name FROM files f LEFT JOIN users u ON u.id = f.owner_id
    WHERE f.record_id = ? AND f.deleted_at IS NULL ORDER BY f.created_at DESC`).all(recordId).map(fromRow);
}

function liveFile(ctx, id) {
  const row = ctx.db.prepare("SELECT * FROM files WHERE id = ? AND deleted_at IS NULL").get(id);
  if (!row) throw new NotFoundError("File not found.");
  return row;
}

export function readFile(ctx, id) {
  const row = liveFile(ctx, id);
  getRecord(ctx, row.object, row.record_id);
  const path = join(filesDir, row.id);
  if (!existsSync(path)) throw new NotFoundError("File not found on disk.");
  return { file: fromRow(row), path };
}

export function deleteFile(ctx, id) {
  const row = liveFile(ctx, id);
  const record = getRecord(ctx, row.object, row.record_id);
  if (row.owner_id !== ctx.user.id && !canEdit(ctx.db, ctx.user, record)) throw new ForbiddenError("You can't delete this file.");
  ctx.db.prepare("UPDATE files SET deleted_at = ? WHERE id = ?").run(now(), id);
}

export function contentDisposition(name) {
  const ascii = String(name).replace(/["\r\n\\]/g, "").replace(/[^\x20-\x7e]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
