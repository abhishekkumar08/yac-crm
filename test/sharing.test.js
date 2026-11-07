import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDb } from "./helpers.js";
import { subordinateUserIds, visibilityClause, canRead, canEdit } from "../server/sharing.js";
import { updateObject } from "../server/metadata.js";

const rec = (ownerId, object = "account") => ({ object, ownerId });

test("subordinates follow the role tree", () => {
  const { db, admin, manager, rep, peer, support } = freshDb();
  assert.deepEqual(new Set(subordinateUserIds(db, manager)), new Set([manager.id, rep.id, peer.id]));
  assert.deepEqual(subordinateUserIds(db, rep), [rep.id]);
  assert.ok(subordinateUserIds(db, admin).includes(support.id));
});

test("public read/write: everyone reads and edits", () => {
  const { db, rep, peer } = freshDb();
  assert.equal(canRead(db, peer, rec(rep.id)), true);
  assert.equal(canEdit(db, peer, rec(rep.id)), true);
  assert.deepEqual(visibilityClause(db, peer, "account"), { sql: "", params: [] });
});

test("private: rep sees own, manager sees rep, peer does not", () => {
  const { db, rep, peer, manager } = freshDb();
  updateObject(db, "account", { sharing: "private" });
  assert.equal(canRead(db, rep, rec(rep.id)), true);
  assert.equal(canRead(db, manager, rec(rep.id)), true);
  assert.equal(canRead(db, peer, rec(rep.id)), false);
  assert.equal(canEdit(db, peer, rec(rep.id)), false);
  const clause = visibilityClause(db, peer, "account");
  assert.match(clause.sql, /owner_id IN/);
  assert.deepEqual(clause.params, [peer.id]);
});

test("public read-only: everyone reads, only the owner chain edits", () => {
  const { db, rep, peer, manager } = freshDb();
  updateObject(db, "account", { sharing: "public_ro" });
  assert.equal(canRead(db, peer, rec(rep.id)), true);
  assert.equal(canEdit(db, peer, rec(rep.id)), false);
  assert.equal(canEdit(db, manager, rec(rep.id)), true);
});

test("admin sees and edits everything", () => {
  const { db, admin, rep } = freshDb();
  updateObject(db, "account", { sharing: "private" });
  assert.equal(canEdit(db, admin, rec(rep.id)), true);
  assert.deepEqual(visibilityClause(db, admin, "account"), { sql: "", params: [] });
});
