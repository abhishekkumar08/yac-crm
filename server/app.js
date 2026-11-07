import express from "express";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { now } from "./db.js";
import { canRead } from "./sharing.js";
import { check } from "./expr.js";
import * as meta from "./metadata.js";
import * as records from "./records.js";
import * as reports from "./reports.js";
import * as users from "./users.js";
import * as currency from "./currency.js";
import * as files from "./files.js";
import * as feed from "./feed.js";
import * as notifications from "./notifications.js";
import * as approvals from "./approvals.js";
import * as email from "./email.js";
import { assistant } from "./assistant.js";
import { QueryError, resolveDateLiteral } from "./query.js";
import { convertLead } from "./convert.js";
import { massUpdate } from "./mass.js";
import { createQuote } from "./quotes.js";
import { importCsv, exportCsv, CsvError } from "./csv.js";
import { COOKIE, login, createSession, sessionUser, destroySession, readCookie } from "./auth.js";

const DIST = fileURLToPath(new URL("../dist", import.meta.url));
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const BAD_REQUEST = [meta.MetadataError, QueryError, reports.ReportError, CsvError, users.UserError, currency.CurrencyError, files.FileError, feed.FeedError, approvals.ApprovalError, email.EmailError];

const wrap = (fn) => (req, res, next) => {
  try {
    const out = fn(req, res);
    if (out !== undefined && !res.headersSent) res.json(out);
  } catch (err) {
    next(err);
  }
};

const wrapAsync = (fn) => (req, res, next) => {
  Promise.resolve().then(() => fn(req, res)).then((out) => {
    if (out !== undefined && !res.headersSent) res.json(out);
  }, next);
};

function parseJsonParam(value, fallback) {
  if (value === undefined || value === "") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    throw new QueryError("Filters must be valid JSON.");
  }
}

function parseSort(value) {
  if (!value) return undefined;
  const [field, dir = "asc"] = String(value).split(":");
  return { field, dir };
}

function listQuery(db, user, object, q) {
  const view = q.view ? meta.getListView(db, q.view) : null;
  if (view && view.object !== object) throw new QueryError("That view belongs to another object.");
  return {
    filters: [...(view?.filters ?? []), ...parseJsonParam(q.filters, [])],
    scope: q.scope ?? view?.scope ?? "all",
    sort: parseSort(q.sort) ?? view?.sort ?? undefined,
    search: q.q,
    limit: q.limit ? Number(q.limit) : 50,
    offset: q.offset ? Number(q.offset) : 0,
    columns: view?.columns,
  };
}

function home(ctx) {
  const today = new Date();
  const week = resolveDateLiteral("NEXT_N_DAYS:7", today);
  const tasks = records.listRecords(ctx, "task", {
    scope: "mine", sort: { field: "due_date", dir: "asc" }, limit: 20,
    filters: [{ field: "status", op: "ne", value: "Completed" }, { field: "due_date", op: "lte", value: week.to }],
  }).records;
  const events = records.listRecords(ctx, "event", {
    scope: "mine", sort: { field: "start", dir: "asc" }, limit: 10,
    filters: [{ field: "start", op: "eq", value: "TODAY" }],
  }).records;
  const quarter = resolveDateLiteral("THIS_QUARTER", today);
  const opps = records.listRecords(ctx, "opportunity", {
    scope: "mine", limit: 2000,
    filters: [{ field: "close_date", op: "gte", value: quarter.from }, { field: "close_date", op: "lte", value: quarter.to }],
  }).records;
  const recent = ctx.db.prepare(`SELECT r.id, r.object, r.name, r.owner_id FROM recent_items ri JOIN records r ON r.id = ri.record_id
    WHERE ri.user_id = ? AND r.deleted_at IS NULL ORDER BY ri.at DESC LIMIT 10`).all(ctx.user.id)
    .filter((r) => canRead(ctx.db, ctx.user, { object: r.object, ownerId: r.owner_id }))
    .map(({ id, object, name }) => ({ id, object, name }));
  const keyDeals = records.listRecords(ctx, "opportunity", {
    scope: "mine", limit: 5, sort: { field: "updated_at", dir: "desc" },
    filters: [{ field: "is_closed", op: "eq", value: false }],
  }).records;
  const sum = (list) => list.reduce((s, o) => s + Number(currency.toCorporate(ctx.db, o.amount ?? 0, o.currency_iso_code) ?? 0), 0);
  return {
    tasks, events, recent, keyDeals, assistant: assistant(ctx),
    quarter: {
      ...quarter,
      closedWon: sum(opps.filter((o) => o.is_won)),
      open: sum(opps.filter((o) => !o.is_closed)),
      closedWonDeals: opps.filter((o) => o.is_won).map((o) => ({ close_date: o.close_date, amount: currency.toCorporate(ctx.db, o.amount ?? 0, o.currency_iso_code) ?? 0 })),
    },
  };
}

const LOOKUP_LIMIT = 8;

function lookupSearch(ctx, targets, q) {
  const asOption = (label) => (r) => ({ id: r.id, name: r.name, object: r.object, label });
  if (targets === "*") {
    return reports.globalSearch(ctx, q, { limit: LOOKUP_LIMIT }).flatMap((g) => g.records.map(asOption(g.label)));
  }
  const labels = new Map(meta.listObjects(ctx.db).map((o) => [o.name, o.label]));
  return String(targets).split(",").flatMap((object) => records.listRecords(ctx, object,
    { search: q, limit: LOOKUP_LIMIT, sort: { field: "updated_at", dir: "desc" } }).records.map(asOption(labels.get(object))));
}

export function createApp(db) {
  const app = express();
  app.disable("x-powered-by");
  const api = express.Router();
  api.use(express.json({ limit: "15mb" }));
  api.use((req, res, next) => {
    if (MUTATING.has(req.method) && !req.is("application/json")) {
      return res.status(415).json({ error: "Send JSON." });
    }
    return next();
  });

  api.post("/auth/login", wrap((req, res) => {
    const user = login(db, req.body?.email, req.body?.password);
    if (!user) return res.status(401).json({ error: "Check your email and password." });
    const { token, expires } = createSession(db, user.id);
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", expires: new Date(expires) });
    return users.getUser(db, user.id);
  }));

  api.use((req, res, next) => {
    const user = sessionUser(db, readCookie(req.headers.cookie, COOKIE));
    if (!user) return res.status(401).json({ error: "Sign in to continue." });
    req.ctx = { db, user };
    return next();
  });
  const admin = (req, res, next) => (req.ctx.user.profile === "admin"
    ? next() : res.status(403).json({ error: "Only admins can change setup." }));

  api.post("/auth/logout", wrap((req, res) => {
    destroySession(db, readCookie(req.headers.cookie, COOKIE));
    res.clearCookie(COOKIE, { path: "/" });
    return { ok: true };
  }));
  api.get("/me", wrap((req) => users.getUser(db, req.ctx.user.id)));

  api.get("/meta/apps", wrap(() => meta.APPS));
  api.get("/meta/currencies", wrap(() => ({ ...currency.getSettings(db), currencies: currency.listCurrencies(db) })));
  api.put("/meta/currencies", admin, wrap((req) => currency.saveCurrencies(db, req.body ?? {})));
  api.get("/meta/objects", wrap(() => meta.listObjects(db)));
  api.get("/meta/objects/:name", wrap((req) => ({
    ...meta.getObject(db, req.params.name), views: meta.listViews(db, req.params.name, req.ctx.user),
  })));
  api.post("/meta/objects", admin, wrap((req, res) => { res.status(201); return meta.createObject(db, req.body); }));
  api.patch("/meta/objects/:name", admin, wrap((req) => meta.updateObject(db, req.params.name, req.body)));
  api.post("/meta/objects/:name/fields", admin, wrap((req, res) => {
    res.status(201);
    return meta.createField(db, req.params.name, req.body);
  }));
  api.patch("/meta/objects/:name/fields/:field", admin, wrap((req) => meta.updateField(db, req.params.name, req.params.field, req.body)));
  api.delete("/meta/objects/:name/fields/:field", admin, wrap((req, res) => {
    meta.deleteField(db, req.params.name, req.params.field);
    res.status(204).end();
  }));
  api.put("/meta/objects/:name/layout", admin, wrap((req) => meta.saveLayout(db, req.params.name, req.body)));
  api.get("/meta/objects/:name/rules", wrap((req) => meta.listValidationRules(db, req.params.name)));
  api.post("/meta/rules", admin, wrap((req, res) => { res.status(201); return meta.createValidationRule(db, req.body); }));
  api.patch("/meta/rules/:id", admin, wrap((req) => meta.updateValidationRule(db, req.params.id, req.body)));
  api.delete("/meta/rules/:id", admin, wrap((req, res) => { meta.deleteValidationRule(db, req.params.id); res.status(204).end(); }));
  api.get("/meta/automations", wrap((req) => meta.listAutomations(db, req.query.object)));
  api.post("/meta/automations", admin, wrap((req, res) => { res.status(201); return meta.createAutomation(db, req.body); }));
  api.patch("/meta/automations/:id", admin, wrap((req) => meta.updateAutomation(db, req.params.id, req.body)));
  api.delete("/meta/automations/:id", admin, wrap((req, res) => { meta.deleteAutomation(db, req.params.id); res.status(204).end(); }));
  api.post("/meta/expr/check", wrap((req) => check(req.body?.formula,
    meta.getObject(db, req.body?.object).fields.map((f) => f.name))));
  api.post("/meta/views", wrap((req, res) => { res.status(201); return meta.createListView(db, req.ctx.user, req.body); }));
  api.patch("/meta/views/:id", wrap((req) => meta.updateListView(db, req.ctx.user, req.params.id, req.body)));
  api.delete("/meta/views/:id", wrap((req, res) => { meta.deleteListView(db, req.ctx.user, req.params.id); res.status(204).end(); }));

  api.get("/records/:object", wrap((req) => {
    const { columns, ...q } = listQuery(db, req.ctx.user, req.params.object, req.query);
    return { ...records.listRecords(req.ctx, req.params.object, q), columns };
  }));
  api.post("/records/:object", wrap((req, res) => {
    res.status(201);
    return records.createRecord(req.ctx, req.params.object, req.body ?? {});
  }));
  api.post("/records/:object/mass", wrap((req) => massUpdate(req.ctx, req.params.object, req.body ?? {})));
  api.get("/records/:object/:id", wrap((req) => {
    const rec = records.getRecord(req.ctx, req.params.object, req.params.id);
    db.prepare(`INSERT INTO recent_items (user_id, record_id, at) VALUES (?, ?, ?)
      ON CONFLICT (user_id, record_id) DO UPDATE SET at = excluded.at`).run(req.ctx.user.id, rec.id, now());
    return rec;
  }));
  api.patch("/records/:object/:id", wrap((req) => records.updateRecord(req.ctx, req.params.object, req.params.id, req.body ?? {})));
  api.delete("/records/:object/:id", wrap((req, res) => {
    records.deleteRecord(req.ctx, req.params.object, req.params.id);
    res.status(204).end();
  }));
  api.get("/records/:object/:id/related", wrap((req) => records.relatedLists(req.ctx, req.params.object, req.params.id)));
  api.get("/records/:object/:id/timeline", wrap((req) => {
    records.getRecord(req.ctx, req.params.object, req.params.id);
    return records.timeline(req.ctx, req.params.id);
  }));
  api.get("/records/:object/:id/history", wrap((req) => records.fieldHistory(req.ctx, req.params.id)));

  api.get("/records/:object/:id/files", wrap((req) => files.listFiles(req.ctx, req.params.object, req.params.id)));
  api.post("/records/:object/:id/files", wrap((req, res) => {
    res.status(201);
    return files.addFile(req.ctx, req.params.object, req.params.id, req.body ?? {});
  }));
  api.get("/files/:id/download", wrap((req, res) => {
    const { file, path } = files.readFile(req.ctx, req.params.id);
    res.set({ "Content-Type": file.type, "Content-Disposition": files.contentDisposition(file.name), "X-Content-Type-Options": "nosniff" });
    res.sendFile(path);
  }));
  api.delete("/files/:id", wrap((req, res) => { files.deleteFile(req.ctx, req.params.id); res.status(204).end(); }));
  api.get("/records/:object/:id/feed", wrap((req) => ({
    items: feed.recordFeed(req.ctx, req.params.object, req.params.id), following: feed.isFollowing(req.ctx, req.params.id),
  })));
  api.post("/records/:object/:id/feed", wrap((req, res) => { res.status(201); return feed.post(req.ctx, req.params.object, req.params.id, req.body?.body); }));
  api.post("/records/:object/:id/follow", wrap((req) => ({ following: feed.toggleFollow(req.ctx, req.params.object, req.params.id) })));
  api.get("/feed", wrap((req) => feed.feed(req.ctx, req.query.scope)));
  api.post("/feed/:id/comments", wrap((req, res) => { res.status(201); return feed.comment(req.ctx, req.params.id, req.body?.body); }));
  api.post("/feed/:id/like", wrap((req) => feed.toggleLike(req.ctx, req.params.id)));
  api.delete("/feed/:id", wrap((req, res) => { feed.deleteItem(req.ctx, req.params.id); res.status(204).end(); }));
  api.get("/notifications", wrap((req) => notifications.listNotifications(req.ctx)));
  api.post("/notifications/read", wrap((req) => { notifications.markRead(req.ctx, req.body?.ids); return { ok: true }; }));
  api.get("/meta/approval-processes", wrap((req) => approvals.listProcesses(db, req.query.object)));
  api.post("/meta/approval-processes", admin, wrap((req, res) => { res.status(201); return approvals.saveProcess(db, req.body ?? {}); }));
  api.put("/meta/approval-processes/:id", admin, wrap((req) => approvals.saveProcess(db, { ...req.body, id: req.params.id })));
  api.delete("/meta/approval-processes/:id", admin, wrap((req, res) => { approvals.deleteProcess(db, req.params.id); res.status(204).end(); }));
  api.get("/records/:object/:id/approvals", wrap((req) => ({
    history: approvals.historyFor(req.ctx, req.params.object, req.params.id),
    hasProcess: approvals.listProcesses(db, req.params.object).some((p) => p.active),
  })));
  api.post("/records/:object/:id/approvals", wrap((req, res) => { res.status(201); return approvals.submit(req.ctx, req.params.object, req.params.id, req.body?.comment); }));
  api.post("/approvals/:id/decide", wrap((req) => approvals.decide(req.ctx, req.params.id, req.body?.decision, req.body?.comment)));
  api.post("/approvals/:id/recall", wrap((req) => { approvals.recall(req.ctx, req.params.id, req.body?.comment); return { ok: true }; }));
  api.get("/approvals/pending", wrap((req) => approvals.pendingFor(req.ctx)));
  api.get("/records/:object/:id/email-defaults", wrap((req) => ({
    ...email.emailDefaults(req.ctx, req.params.object, req.params.id),
    templates: email.listTemplates(db, req.params.object),
    delivery: email.getDeliverability(db).enabled ? "smtp" : "outbox",
  })));
  api.post("/records/:object/:id/email", wrapAsync((req, res) => {
    res.status(201);
    return email.sendEmail(req.ctx, { ...req.body, object: req.params.object, recordId: req.params.id });
  }));
  api.get("/outbox", wrap((req) => email.listOutbox(req.ctx)));
  api.get("/meta/email-templates", wrap((req) => email.listTemplates(db, req.query.object)));
  api.post("/meta/email-templates", admin, wrap((req, res) => { res.status(201); return email.saveTemplate(db, req.ctx.user, req.body ?? {}); }));
  api.put("/meta/email-templates/:id", admin, wrap((req) => email.saveTemplate(db, req.ctx.user, { ...req.body, id: req.params.id })));
  api.delete("/meta/email-templates/:id", admin, wrap((req, res) => { email.deleteTemplate(db, req.params.id); res.status(204).end(); }));
  api.get("/meta/deliverability", admin, wrap(() => email.getDeliverability(db)));
  api.put("/meta/deliverability", admin, wrap((req) => email.saveDeliverability(db, req.body ?? {})));
  api.get("/recycle-bin", wrap((req) => records.recycleBin(req.ctx)));
  api.post("/recycle-bin/:id/restore", wrap((req) => records.restoreRecord(req.ctx, req.params.id)));
  api.post("/leads/:id/convert", wrap((req) => convertLead(req.ctx, req.params.id, req.body ?? {})));
  api.post("/opportunities/:id/quote", wrap((req, res) => { res.status(201); return createQuote(req.ctx, req.params.id, req.body ?? {}); }));

  api.get("/search", wrap((req) => reports.globalSearch(req.ctx, req.query.q, { limit: Number(req.query.limit ?? 5) })));
  api.get("/lookup", wrap((req) => lookupSearch(req.ctx, req.query.objects ?? "*", req.query.q ?? "")));
  api.get("/home", wrap((req) => home(req.ctx)));
  api.get("/calendar", wrap((req) => records.listRecords(req.ctx, "event", {
    limit: 1000, sort: { field: "start", dir: "asc" }, scope: req.query.scope ?? "all",
    filters: [{ field: "start", op: "gte", value: req.query.from }, { field: "start", op: "lte", value: req.query.to }],
  }).records));

  api.get("/users", wrap((req) => users.listUsers(db, { includeInactive: req.query.all === "1" })));
  api.post("/users", admin, wrap((req, res) => { res.status(201); return users.createUser(db, req.body ?? {}); }));
  api.patch("/users/:id", admin, wrap((req) => users.updateUser(db, req.ctx.user, req.params.id, req.body ?? {})));
  api.get("/roles", wrap(() => users.listRoles(db)));
  api.post("/roles", admin, wrap((req, res) => { res.status(201); return users.saveRole(db, req.body ?? {}); }));
  api.patch("/roles/:id", admin, wrap((req) => users.saveRole(db, { ...req.body, id: req.params.id })));
  api.delete("/roles/:id", admin, wrap((req, res) => { users.deleteRole(db, req.params.id); res.status(204).end(); }));

  api.post("/import/:object", wrap((req) => importCsv(req.ctx, req.params.object, req.body?.csv ?? "")));
  api.get("/export/:object", wrap((req, res) => {
    const q = listQuery(db, req.ctx.user, req.params.object, req.query);
    const csv = exportCsv(req.ctx, req.params.object, q);
    res.type("text/csv").attachment(`${req.params.object}.csv`).send(csv);
  }));

  api.get("/reports", wrap((req) => reports.listReports(req.ctx)));
  api.post("/reports", wrap((req, res) => { res.status(201); return reports.saveReport(req.ctx, req.body ?? {}); }));
  api.post("/reports/run", wrap((req) => reports.runReport(req.ctx, req.body ?? {})));
  api.get("/reports/:id", wrap((req) => {
    const report = reports.getReport(req.ctx, req.params.id);
    if (!report) throw new records.NotFoundError("Report not found.");
    return { ...report, result: reports.runReport(req.ctx, report.def) };
  }));
  api.put("/reports/:id", wrap((req) => reports.saveReport(req.ctx, { ...req.body, id: req.params.id })));
  api.delete("/reports/:id", wrap((req, res) => { reports.deleteReport(req.ctx, req.params.id); res.status(204).end(); }));
  api.get("/dashboards", wrap((req) => reports.listDashboards(req.ctx)));
  api.post("/dashboards", wrap((req, res) => { res.status(201); return reports.saveDashboard(req.ctx, req.body ?? {}); }));
  api.get("/dashboards/:id", wrap((req) => reports.runDashboard(req.ctx, req.params.id)));
  api.put("/dashboards/:id", wrap((req) => reports.saveDashboard(req.ctx, { ...req.body, id: req.params.id })));
  api.delete("/dashboards/:id", wrap((req, res) => { reports.deleteDashboard(req.ctx, req.params.id); res.status(204).end(); }));
  api.get("/forecast", wrap((req) => reports.forecast(req.ctx, { year: Number(req.query.year) || new Date().getFullYear() })));

  api.use((req, res) => res.status(404).json({ error: "Not found." }));
  api.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err instanceof records.ValidationError) return res.status(400).json({ error: err.message, fields: err.errors });
    if (BAD_REQUEST.some((E) => err instanceof E)) return res.status(400).json({ error: err.message });
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Send valid JSON." });
    if (err instanceof records.ForbiddenError) return res.status(403).json({ error: err.message });
    if (err instanceof records.NotFoundError) return res.status(404).json({ error: err.message });
    process.stderr.write(`${err.stack ?? err}\n`);
    return res.status(500).json({ error: "Something went wrong." });
  });

  app.use("/api", api);
  if (existsSync(DIST)) {
    app.use(express.static(DIST));
    app.get(/^(?!\/api).*/, (req, res) => res.sendFile(`${DIST}/index.html`));
  }
  return app;
}
