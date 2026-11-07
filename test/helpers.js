import { openDb, now } from "../server/db.js";
import { seedMetadata } from "../server/metadata.js";

export function freshDb() {
  const db = openDb(":memory:");
  seedMetadata(db);
  const role = db.prepare("INSERT INTO roles (id, name, parent_id) VALUES (?, ?, ?)");
  role.run("r_ceo", "CEO", null);
  role.run("r_mgr", "Sales Manager", "r_ceo");
  role.run("r_rep", "Sales Rep", "r_mgr");
  role.run("r_svc", "Support", "r_ceo");
  const user = db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role_id, profile, created_at) VALUES (?, ?, ?, 'x', ?, ?, ?)");
  const users = {
    admin: ["u_admin", "Ada Admin", "admin@test", "r_ceo", "admin"],
    manager: ["u_mgr", "Max Manager", "mgr@test", "r_mgr", "standard"],
    rep: ["u_rep", "Rae Rep", "rep@test", "r_rep", "standard"],
    peer: ["u_peer", "Pat Peer", "peer@test", "r_rep", "standard"],
    support: ["u_svc", "Sam Support", "svc@test", "r_svc", "standard"],
  };
  const out = { db };
  for (const [key, [id, name, email, roleId, profile]] of Object.entries(users)) {
    user.run(id, name, email, roleId, profile, now());
    out[key] = { id, name, roleId, profile };
  }
  out.ctx = (who = "admin") => ({ db, user: out[who] });
  return out;
}
