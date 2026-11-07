import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { freshDb } from "./helpers.js";
import { addFile, listFiles, readFile, deleteFile, FileError, MAX_BYTES, setFilesDir, contentDisposition } from "../server/files.js";
import { createRecord, ForbiddenError } from "../server/records.js";
import { updateObject } from "../server/metadata.js";

setFilesDir(mkdtempSync(join(tmpdir(), "crm-files-")));
const b64 = (s) => Buffer.from(s).toString("base64");

test("upload, list and read a file on a record", () => {
  const { ctx } = freshDb();
  const acc = createRecord(ctx(), "account", { name: "A" });
  const f = addFile(ctx(), "account", acc.id, { name: "notes.txt", type: "text/plain", data: b64("hello") });
  assert.equal(f.size, 5);
  assert.deepEqual(listFiles(ctx(), "account", acc.id).map((x) => x.name), ["notes.txt"]);
  const { path, file } = readFile(ctx(), f.id);
  assert.equal(readFileSync(path, "utf8"), "hello");
  assert.equal(file.type, "text/plain");
});

test("stored path never comes from the file name", () => {
  const { ctx } = freshDb();
  const acc = createRecord(ctx(), "account", { name: "A" });
  const f = addFile(ctx(), "account", acc.id, { name: "../../etc/passwd", type: "text/plain", data: b64("x") });
  const { path } = readFile(ctx(), f.id);
  assert.ok(path.endsWith(f.id));
  assert.equal(f.name, "passwd");
});

test("files over the size limit and empty files are rejected", () => {
  const { ctx } = freshDb();
  const acc = createRecord(ctx(), "account", { name: "A" });
  assert.throws(() => addFile(ctx(), "account", acc.id, { name: "big.bin", type: "application/octet-stream", data: Buffer.alloc(MAX_BYTES + 1).toString("base64") }), FileError);
  assert.throws(() => addFile(ctx(), "account", acc.id, { name: "e.txt", type: "text/plain", data: "" }), FileError);
});

test("file access follows the record's sharing", () => {
  const { ctx, db } = freshDb();
  updateObject(db, "account", { sharing: "private" });
  const acc = createRecord(ctx("peer"), "account", { name: "Secret" });
  const f = addFile(ctx("peer"), "account", acc.id, { name: "s.txt", type: "text/plain", data: b64("s") });
  assert.throws(() => listFiles(ctx("rep"), "account", acc.id), ForbiddenError);
  assert.throws(() => readFile(ctx("rep"), f.id), ForbiddenError);
  assert.throws(() => addFile(ctx("rep"), "account", acc.id, { name: "x.txt", type: "text/plain", data: b64("x") }), ForbiddenError);
});

test("deleted files disappear but the bytes stay on disk", () => {
  const { ctx } = freshDb();
  const acc = createRecord(ctx(), "account", { name: "A" });
  const f = addFile(ctx(), "account", acc.id, { name: "a.txt", type: "text/plain", data: b64("a") });
  const { path } = readFile(ctx(), f.id);
  deleteFile(ctx(), f.id);
  assert.equal(listFiles(ctx(), "account", acc.id).length, 0);
  assert.ok(existsSync(path));
  assert.throws(() => readFile(ctx(), f.id), /not found/);
});

test("content disposition is safe for odd names", () => {
  assert.equal(contentDisposition('a"b\r\n.pdf'), `attachment; filename="ab.pdf"; filename*=UTF-8''a%22b%0D%0A.pdf`);
});
