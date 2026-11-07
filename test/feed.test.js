import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDb } from "./helpers.js";
import { post, comment, toggleLike, deleteItem, recordFeed, feed, toggleFollow, isFollowing, FeedError } from "../server/feed.js";
import { listNotifications, markRead } from "../server/notifications.js";
import { createRecord, updateRecord } from "../server/records.js";
import { updateObject } from "../server/metadata.js";

const mention = (u) => `@[${u.name}](${u.id})`;

test("post, comment and like on a record", () => {
  const { ctx } = freshDb();
  const acc = createRecord(ctx(), "account", { name: "Acme" });
  const item = post(ctx("rep"), "account", acc.id, "Kickoff went well");
  comment(ctx("peer"), item.id, "Nice");
  assert.equal(toggleLike(ctx("peer"), item.id).liked, true);
  const [first] = recordFeed(ctx("rep"), "account", acc.id).filter((i) => i.type === "post");
  assert.equal(first.body, "Kickoff went well");
  assert.equal(first.authorName, "Rae Rep");
  assert.equal(first.comments[0].body, "Nice");
  assert.equal(first.likes, 1);
  assert.equal(toggleLike(ctx("peer"), item.id).liked, false);
});

test("empty posts are rejected", () => {
  const { ctx } = freshDb();
  const acc = createRecord(ctx(), "account", { name: "Acme" });
  assert.throws(() => post(ctx(), "account", acc.id, "   "), FeedError);
});

test("mentions notify the mentioned user and show in their To Me feed", () => {
  const { ctx, peer } = freshDb();
  const acc = createRecord(ctx(), "account", { name: "Acme" });
  post(ctx("rep"), "account", acc.id, `Can you call them ${mention(peer)}?`);
  const notes = listNotifications(ctx("peer"));
  assert.equal(notes.unread, 1);
  assert.match(notes.items[0].title, /Rae Rep mentioned you/);
  assert.equal(notes.items[0].link, `/r/account/${acc.id}`);
  assert.equal(feed(ctx("peer"), "mentions").length, 1);
  markRead(ctx("peer"));
  assert.equal(listNotifications(ctx("peer")).unread, 0);
});

test("comment on someone's post notifies the post author", () => {
  const { ctx } = freshDb();
  const acc = createRecord(ctx(), "account", { name: "Acme" });
  const item = post(ctx("rep"), "account", acc.id, "Hello");
  comment(ctx("peer"), item.id, "Hi");
  assert.match(listNotifications(ctx("rep")).items[0].title, /Pat Peer commented/);
  comment(ctx("rep"), item.id, "Thanks");
  assert.equal(listNotifications(ctx("rep")).items.length, 1);
});

test("tracked field changes become feed items", () => {
  const { ctx } = freshDb();
  const opp = createRecord(ctx(), "opportunity", { name: "O", close_date: "2026-01-01", amount: 10 });
  updateRecord(ctx(), "opportunity", opp.id, { stage: "Qualification", amount: 20, next_step: "x" });
  const tracked = recordFeed(ctx(), "opportunity", opp.id).filter((i) => i.type === "tracked");
  assert.equal(tracked.length, 1);
  assert.deepEqual(tracked[0].changes.map((c) => c.field).sort(), ["amount", "stage"]);
});

test("owner change notifies the new owner", () => {
  const { ctx, rep } = freshDb();
  const acc = createRecord(ctx(), "account", { name: "Acme" });
  updateRecord(ctx(), "account", acc.id, { ownerId: rep.id });
  assert.match(listNotifications(ctx("rep")).items[0].title, /assigned you/);
});

test("following feed shows followed records and own posts", () => {
  const { ctx } = freshDb();
  const a = createRecord(ctx(), "account", { name: "A" });
  const b = createRecord(ctx(), "account", { name: "B" });
  post(ctx(), "account", a.id, "on A");
  post(ctx(), "account", b.id, "on B");
  assert.equal(feed(ctx("rep"), "following").length, 0);
  assert.equal(toggleFollow(ctx("rep"), "account", a.id), true);
  assert.equal(isFollowing(ctx("rep"), a.id), true);
  assert.deepEqual(feed(ctx("rep"), "following").filter((i) => i.type === "post").map((i) => i.body), ["on A"]);
  assert.equal(toggleFollow(ctx("rep"), "account", a.id), false);
});

test("creators follow their records automatically", () => {
  const { ctx } = freshDb();
  const a = createRecord(ctx("rep"), "account", { name: "Mine" });
  assert.equal(isFollowing(ctx("rep"), a.id), true);
});

test("All Company feed hides posts on records you can't read", () => {
  const { ctx, db } = freshDb();
  updateObject(db, "account", { sharing: "private" });
  const secret = createRecord(ctx("peer"), "account", { name: "Secret" });
  post(ctx("peer"), "account", secret.id, "hush");
  assert.equal(feed(ctx("rep"), "all").filter((i) => i.body === "hush").length, 0);
  assert.equal(feed(ctx("manager"), "all").filter((i) => i.body === "hush").length, 1);
});

test("only the author or an admin deletes a post", () => {
  const { ctx } = freshDb();
  const acc = createRecord(ctx(), "account", { name: "Acme" });
  const item = post(ctx("rep"), "account", acc.id, "mine");
  assert.throws(() => deleteItem(ctx("peer"), item.id), /only/i);
  deleteItem(ctx(), item.id);
  assert.equal(recordFeed(ctx(), "account", acc.id).filter((i) => i.type === "post").length, 0);
});
