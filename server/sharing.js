import { isAdmin } from "./metadata.js";

export function subordinateUserIds(db, user) {
  const rows = db.prepare(`
    WITH RECURSIVE below(id) AS (
      SELECT id FROM roles WHERE parent_id = ?
      UNION SELECT r.id FROM roles r JOIN below b ON r.parent_id = b.id
    )
    SELECT id FROM users WHERE role_id IN (SELECT id FROM below) AND id != ?`).all(user.roleId ?? null, user.id);
  return [user.id, ...rows.map((r) => r.id)];
}

const sharingOf = (db, object) => db.prepare("SELECT sharing FROM objects WHERE name = ?").get(object)?.sharing;
const hasPrivateFlag = (db, object) => Boolean(db.prepare("SELECT 1 FROM fields WHERE object = ? AND name = 'is_private'").get(object));

export function visibilityClause(db, user, object, alias = "r") {
  if (isAdmin(user)) return { sql: "", params: [] };
  const privateObject = sharingOf(db, object) === "private";
  if (!privateObject && !hasPrivateFlag(db, object)) return { sql: "", params: [] };
  const ids = subordinateUserIds(db, user);
  const inChain = `${alias}.owner_id IN (${ids.map(() => "?").join(", ")})`;
  if (privateObject) return { sql: inChain, params: ids };
  return { sql: `(coalesce(json_extract(${alias}.data, '$.is_private'), 0) = 0 OR ${inChain})`, params: ids };
}

export function canRead(db, user, record) {
  if (isAdmin(user)) return true;
  if (!record.is_private && sharingOf(db, record.object) !== "private") return true;
  return subordinateUserIds(db, user).includes(record.ownerId);
}

export function canEdit(db, user, record) {
  if (isAdmin(user)) return true;
  if (!record.is_private && sharingOf(db, record.object) === "public_rw") return true;
  return subordinateUserIds(db, user).includes(record.ownerId);
}
