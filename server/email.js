import nodemailer from "nodemailer";
import { newId, now } from "./db.js";
import { getObject, isAdmin } from "./metadata.js";
import { getRecord, createRecord, liveRecord } from "./records.js";
import { getSetting, setSetting } from "./currency.js";
import { canRead } from "./sharing.js";
import { ymd } from "../shared/dates.js";

export class EmailError extends Error {}

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const MERGE = /\{!(\w+)\.(\w+)\}/g;
const MAX_RECIPIENTS = 50;
const PEOPLE = new Set(["contact", "lead"]);
const OFF = { enabled: false, host: "", port: 587, secure: false, user: "", from: "" };

let transportFactory = null;
export const setTransportFactory = (fn) => { transportFactory = fn; };

const norm = (s) => String(s).toLowerCase().replace(/_/g, "");

function addresses(value) {
  const list = (Array.isArray(value) ? value : String(value ?? "").split(/[,;]/)).map((s) => String(s).trim()).filter(Boolean);
  const bad = list.find((a) => !EMAIL_RE.test(a));
  if (bad) throw new EmailError(`${bad} is not a valid email address.`);
  if (list.length > MAX_RECIPIENTS) throw new EmailError(`Send to at most ${MAX_RECIPIENTS} addresses.`);
  return list;
}

function mergeContext(ctx, object, recordId) {
  const record = getRecord(ctx, object, recordId);
  const out = { [norm(getObject(ctx.db, object).label)]: record, [norm(object)]: record };
  const readable = (id) => {
    const rec = id ? liveRecord(ctx.db, id) : null;
    return rec && canRead(ctx.db, ctx.user, rec) ? rec : null;
  };
  const add = (key, id) => {
    if (out[key]) return;
    const rec = readable(id);
    if (rec) out[key] = rec;
  };
  add("account", object === "account" ? null : record.account);
  const personId = record.contact ?? (PEOPLE.has(object) ? null : record.who);
  if (personId) {
    const person = readable(personId);
    if (person) out[person.object] = person;
  }
  if (!out.account && out.contact?.account) add("account", out.contact.account);
  const sender = ctx.db.prepare("SELECT name, email FROM users WHERE id = ?").get(ctx.user.id) ?? {};
  out.user = { name: sender.name, email: sender.email, first_name: String(sender.name ?? "").split(" ")[0] };
  return { record, out };
}

function fieldOf(rec, field) {
  const want = norm(field);
  const key = Object.keys(rec).find((k) => !k.startsWith("$") && norm(k) === want);
  const value = key === undefined ? null : rec[key];
  return value === null || value === undefined ? "" : Array.isArray(value) ? value.join("; ") : String(value);
}

export function renderMerge(ctx, text, object, recordId) {
  const { out } = mergeContext(ctx, object, recordId);
  return String(text ?? "").replace(MERGE, (_, obj, field) => (out[norm(obj)] ? fieldOf(out[norm(obj)], field) : ""));
}

export function emailDefaults(ctx, object, recordId) {
  const { out } = mergeContext(ctx, object, recordId);
  const email = out.contact?.email ?? out.lead?.email ?? null;
  return { to: email ? [email] : [] };
}

export function getDeliverability(db) {
  return { ...OFF, ...getSetting(db, "smtp", OFF), passwordSet: Boolean(process.env.CRM_SMTP_PASSWORD) };
}

export function saveDeliverability(db, { enabled, host, port, secure, user, from }) {
  if (enabled && !String(host ?? "").trim()) throw new EmailError("Enter the SMTP host.");
  const portNumber = Number(port);
  if (enabled && !(Number.isInteger(portNumber) && portNumber > 0 && portNumber < 65536)) throw new EmailError("Enter a valid SMTP port.");
  if (from && !EMAIL_RE.test(from)) throw new EmailError("Enter a valid From address.");
  setSetting(db, "smtp", { enabled: Boolean(enabled), host: String(host ?? "").trim(), port: portNumber || 587,
    secure: Boolean(secure), user: String(user ?? "").trim(), from: String(from ?? "").trim() });
  return getDeliverability(db);
}

function makeTransport(settings) {
  if (transportFactory) return transportFactory(settings);
  return nodemailer.createTransport({ host: settings.host, port: settings.port, secure: settings.secure,
    auth: settings.user ? { user: settings.user, pass: process.env.CRM_SMTP_PASSWORD } : undefined });
}

async function deliver(settings, mail) {
  if (!settings.enabled) return { status: "Sent", transport: "outbox", error: null };
  if (!process.env.CRM_SMTP_PASSWORD && settings.user) {
    return { status: "Failed", transport: "smtp", error: "The SMTP password is not set. Start the server with CRM_SMTP_PASSWORD." };
  }
  try {
    await makeTransport(settings).sendMail(mail);
    return { status: "Sent", transport: "smtp", error: null };
  } catch (err) {
    return { status: "Failed", transport: "smtp", error: String(err.message ?? err).slice(0, 500) };
  }
}

const messageFromRow = (r) => ({ id: r.id, recordId: r.record_id, object: r.object, from: r.from_address,
  to: JSON.parse(r.to_addresses), cc: JSON.parse(r.cc_addresses ?? "[]"), bcc: JSON.parse(r.bcc_addresses ?? "[]"),
  subject: r.subject, body: r.body, status: r.status, transport: r.transport, error: r.error, sentBy: r.sent_by,
  sentByName: r.sent_by_name ?? null, sentAt: r.sent_at, recordName: r.record_name ?? null });

export async function sendEmail(ctx, { object, recordId, to, cc, bcc, subject, body }) {
  const toList = addresses(to);
  if (!toList.length) throw new EmailError("Add at least one recipient.");
  const ccList = addresses(cc);
  const bccList = addresses(bcc);
  if (!String(subject ?? "").trim()) throw new EmailError("Enter a subject.");
  const { record } = mergeContext(ctx, object, recordId);
  const finalSubject = renderMerge(ctx, subject, object, recordId);
  const finalBody = renderMerge(ctx, body, object, recordId);
  const settings = getDeliverability(ctx.db);
  const sender = ctx.db.prepare("SELECT email FROM users WHERE id = ?").get(ctx.user.id)?.email;
  const from = settings.from || sender;
  const result = await deliver(settings, { from, to: toList.join(", "), cc: ccList.join(", ") || undefined,
    bcc: bccList.join(", ") || undefined, subject: finalSubject, text: finalBody });
  const id = newId("02s");
  ctx.db.prepare(`INSERT INTO email_messages (id, record_id, object, from_address, to_addresses, cc_addresses, bcc_addresses,
    subject, body, status, transport, error, sent_by, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, recordId, object, from, JSON.stringify(toList), JSON.stringify(ccList), JSON.stringify(bccList), finalSubject,
      finalBody, result.status, result.transport, result.error, ctx.user.id, now());
  if (result.status === "Sent") {
    const contact = record.contact ? liveRecord(ctx.db, record.contact) : null;
    const link = PEOPLE.has(object) ? { who: recordId } : { what: recordId, ...(contact ? { who: contact.id } : {}) };
    createRecord(ctx, "task", { subject: `Email: ${finalSubject}`.slice(0, 255), type: "Email", status: "Completed",
      due_date: ymd(new Date()), description: finalBody, ...link }, { system: true, skipAutomation: true });
  }
  return messageFromRow(ctx.db.prepare("SELECT * FROM email_messages WHERE id = ?").get(id));
}

export function listOutbox(ctx) {
  const rows = ctx.db.prepare(`SELECT m.*, u.name AS sent_by_name, r.name AS record_name FROM email_messages m
    LEFT JOIN users u ON u.id = m.sent_by LEFT JOIN records r ON r.id = m.record_id
    ${isAdmin(ctx.user) ? "" : "WHERE m.sent_by = ?"} ORDER BY m.sent_at DESC, m.rowid DESC LIMIT 200`)
    .all(...(isAdmin(ctx.user) ? [] : [ctx.user.id]));
  return rows.map(messageFromRow);
}

const templateFromRow = (r) => ({ id: r.id, name: r.name, object: r.object, subject: r.subject, body: r.body, updatedAt: r.updated_at });

export function listTemplates(db, object) {
  const rows = object
    ? db.prepare("SELECT * FROM email_templates WHERE object IS NULL OR object = ? ORDER BY name").all(object)
    : db.prepare("SELECT * FROM email_templates ORDER BY name").all();
  return rows.map(templateFromRow);
}

export function saveTemplate(db, user, { id, name, object, subject, body }) {
  if (!String(name ?? "").trim()) throw new EmailError("Enter a template name.");
  if (!String(subject ?? "").trim()) throw new EmailError("Enter a subject.");
  if (object) getObject(db, object);
  const values = [name.trim(), object || null, subject, String(body ?? ""), now()];
  if (id) {
    db.prepare("UPDATE email_templates SET name = ?, object = ?, subject = ?, body = ?, updated_at = ? WHERE id = ?").run(...values, id);
    return templateFromRow(db.prepare("SELECT * FROM email_templates WHERE id = ?").get(id));
  }
  const newTemplateId = newId("00X");
  db.prepare("INSERT INTO email_templates (name, object, subject, body, updated_at, id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(...values, newTemplateId, user.id);
  return templateFromRow(db.prepare("SELECT * FROM email_templates WHERE id = ?").get(newTemplateId));
}

export function deleteTemplate(db, id) {
  db.prepare("DELETE FROM email_templates WHERE id = ?").run(id);
}
