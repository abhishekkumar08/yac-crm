import { scryptSync, randomBytes, timingSafeEqual, createHash } from "node:crypto";

const SESSION_DAYS = 7;
const DUMMY_HASH = `scrypt$${"0".repeat(32)}$${"0".repeat(128)}`;
export const COOKIE = "crm_session";

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(String(password), salt, 64).toString("hex")}`;
}

export function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored ?? "").split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(String(password), salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const tokenHash = (token) => createHash("sha256").update(String(token)).digest("hex");

export function login(db, email, password) {
  const user = db.prepare("SELECT * FROM users WHERE email = ? AND active = 1").get(String(email ?? "").trim());
  const ok = verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  return ok && user ? user : null;
}

export function createSession(db, userId) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(tokenHash(token), userId, expires);
  return { token, expires };
}

export function sessionUser(db, token) {
  if (!token) return null;
  const row = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`).get(tokenHash(token), new Date().toISOString());
  return row ? { id: row.id, name: row.name, email: row.email, roleId: row.role_id, profile: row.profile } : null;
}

export function destroySession(db, token) {
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash(token));
}

export function readCookie(header, name) {
  for (const part of String(header ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}
