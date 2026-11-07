import { newId, now } from "./db.js";
import { hashPassword } from "./auth.js";

export class UserError extends Error {}

const EMAIL_RE = /^[^\s@]+@[^\s@]+$/;
const MIN_PASSWORD = 8;

const userFromRow = (r) => ({ id: r.id, name: r.name, email: r.email, roleId: r.role_id, roleName: r.role_name ?? null,
  defaultCurrency: r.default_currency ?? null,
  profile: r.profile, active: Boolean(r.active), createdAt: r.created_at });

export function listUsers(db, { includeInactive = false } = {}) {
  return db.prepare(`SELECT u.*, r.name AS role_name FROM users u LEFT JOIN roles r ON r.id = u.role_id
    ${includeInactive ? "" : "WHERE u.active = 1"} ORDER BY u.name`).all().map(userFromRow);
}

export function getUser(db, id) {
  const row = db.prepare("SELECT u.*, r.name AS role_name FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = ?").get(id);
  if (!row) throw new UserError("User not found.");
  return userFromRow(row);
}

function checkFields(db, { name, email, roleId, profile }, selfId) {
  if (name !== undefined && !String(name).trim()) throw new UserError("Enter a name.");
  if (email !== undefined) {
    if (!EMAIL_RE.test(String(email))) throw new UserError("Enter a valid email address.");
    const dup = db.prepare("SELECT id FROM users WHERE email = ? AND id != ?").get(String(email).trim(), selfId ?? "");
    if (dup) throw new UserError("Another user already has this email.");
  }
  if (roleId && !db.prepare("SELECT 1 FROM roles WHERE id = ?").get(roleId)) throw new UserError("Choose a valid role.");
  if (profile !== undefined && !["admin", "standard"].includes(profile)) throw new UserError("Choose a valid profile.");
}

function checkPassword(password) {
  if (String(password ?? "").length < MIN_PASSWORD) throw new UserError(`Use at least ${MIN_PASSWORD} characters for the password.`);
}

export function createUser(db, { name, email, roleId, profile = "standard", password }) {
  checkFields(db, { name, email, roleId, profile });
  checkPassword(password);
  const id = newId("005");
  db.prepare("INSERT INTO users (id, name, email, password_hash, role_id, profile, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, String(name).trim(), String(email).trim(), hashPassword(password), roleId ?? null, profile, now());
  return getUser(db, id);
}

export function updateUser(db, actor, id, patch) {
  const user = getUser(db, id);
  checkFields(db, patch, id);
  if (id === actor.id && (patch.active === false || patch.profile === "standard")) {
    throw new UserError("You can't deactivate yourself or remove your own admin access.");
  }
  const next = { ...user, ...patch };
  db.prepare("UPDATE users SET name = ?, email = ?, role_id = ?, profile = ?, active = ?, default_currency = ? WHERE id = ?")
    .run(String(next.name).trim(), String(next.email).trim(), next.roleId ?? null, next.profile, next.active ? 1 : 0,
      next.defaultCurrency || null, id);
  if (patch.password !== undefined) {
    checkPassword(patch.password);
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(patch.password), id);
  }
  if (patch.active === false || patch.password !== undefined) db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
  return getUser(db, id);
}

export function listRoles(db) {
  return db.prepare(`SELECT r.*, (SELECT count(*) FROM users u WHERE u.role_id = r.id AND u.active = 1) AS users
    FROM roles r ORDER BY r.name`).all().map((r) => ({ id: r.id, name: r.name, parentId: r.parent_id, users: r.users }));
}

function wouldCycle(db, id, parentId) {
  for (let p = parentId; p; p = db.prepare("SELECT parent_id FROM roles WHERE id = ?").get(p)?.parent_id) {
    if (p === id) return true;
  }
  return false;
}

export function saveRole(db, { id, name, parentId }) {
  if (!String(name ?? "").trim()) throw new UserError("Enter a role name.");
  if (parentId && !db.prepare("SELECT 1 FROM roles WHERE id = ?").get(parentId)) throw new UserError("Choose a valid parent role.");
  if (id) {
    if (parentId && wouldCycle(db, id, parentId)) throw new UserError("A role can't report to itself or to a role below it.");
    db.prepare("UPDATE roles SET name = ?, parent_id = ? WHERE id = ?").run(String(name).trim(), parentId ?? null, id);
    return listRoles(db).find((r) => r.id === id);
  }
  const roleId = newId("00E");
  db.prepare("INSERT INTO roles (id, name, parent_id) VALUES (?, ?, ?)").run(roleId, String(name).trim(), parentId ?? null);
  return listRoles(db).find((r) => r.id === roleId);
}

export function deleteRole(db, id) {
  if (db.prepare("SELECT 1 FROM users WHERE role_id = ?").get(id)) throw new UserError("Move this role's users first.");
  if (db.prepare("SELECT 1 FROM roles WHERE parent_id = ?").get(id)) throw new UserError("Move the roles below this one first.");
  db.prepare("DELETE FROM roles WHERE id = ?").run(id);
}
