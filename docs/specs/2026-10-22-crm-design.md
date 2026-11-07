# yac-crm — design

Status: draft for review · 2026-10-22 · working name until YAC HQ picks one

## Problem and user

A YAC product: a CRM that works the way Salesforce's Sales and Service apps work, so someone who knows
Salesforce feels at home. One company per install, several users with sign-in and roles. Runs locally.

"Exactly like Salesforce" means behaviour, objects, navigation and screen structure. It does not mean
the Salesforce name, logo, visual skin (Lightning/SLDS) or any of their code or assets — company rule
and REA's terms. The look comes from Kasumi; the product brand lives in this repo.

## Scope — everything ships together (no v1/v2 split)

| Area | Included |
|---|---|
| Standard objects | Account, Contact, Lead, Opportunity (+ line items), Product, Price Book (+ entries), Quote (+ line items), Campaign (+ members), Case, Task, Event, Note |
| Navigation | Global header (search, user menu), app launcher switching between a Sales app and a Service app, per-app object tabs, Home page (today's tasks, quarter performance, recent records) |
| List views | Saved views per object (mine / shared), filters, sort, column choice, search-this-list, inline edit, mass actions (change owner, delete), kanban mode grouped by any picklist |
| Record page | Highlights panel (key fields + actions), Path stage bar (Lead status, Opportunity stage, Case status), Details tab from the page layout, Related tab with related lists, Activity panel (New Task, Log a Call, New Event, Log Email — logged, never sent) and a timeline |
| Flows | Lead conversion → Account + Contact + optional Opportunity (match existing account), Opportunity Closed Won/Lost, Case escalation via automation, Quote from Opportunity line items |
| Setup | Object Manager: custom objects, custom fields, picklist values, page layouts, validation rules, formula fields, roll-up summary fields, auto-numbers. Users, roles (hierarchy), org-wide sharing defaults. Automation rules ("when a record is created/updated and matches X → set field / create task"). |
| Insight | Reports (tabular, summary grouped by up to 2 fields, with chart), dashboards of report components, forecast by quarter and owner |
| Everywhere | Global search, CSV import/export per object, field history tracking, recycle bin (soft delete + restore; nothing is hard-deleted), calendar of Events |

Deferred, with reason: a code platform (Apex/Visualforce-like), app marketplace, AI features, Chatter
social feed, approval processes, real email send / inbox sync (outward-facing), mobile app,
multi-currency, territories, marketing/commerce/community products. Each is a product of its own.

## Approach: hybrid metadata engine

Chosen over fixed per-object screens (no custom objects/fields) and a purely generic engine (pipeline,
conversion and reports feel bland). Every object — standard or custom — is metadata (fields, layouts,
list views). One generic list view and record page render any object. Purpose-built screens sit on top
for pipeline kanban, lead conversion, activity timeline, reports and dashboards.

## Components

| Unit | Purpose | Depends on |
|---|---|---|
| Metadata store | Objects, fields, picklists, layouts, list views; seeds the standard objects | DB |
| Record service | CRUD, type coercion, validation rules, formulas, roll-ups, auto-numbers, field history, soft delete | metadata, expression engine, sharing |
| Expression engine | One small safe language (no `eval`) for formulas, validation rules and automation criteria | none |
| Query compiler | List-view / report filters + sort → parameterised SQL over JSON record data | metadata |
| Sharing | Who can read/edit a record: owner, role hierarchy, org-wide defaults per object | users/roles |
| Automation | Runs matching rules after save (set field, create task); loop-guarded | record service, expression engine |
| Flows | Lead conversion, quote generation — transactional | record service |
| Reports | Grouping + aggregates (count, sum, avg, min, max) + chart data; dashboards reference reports | query compiler |
| Auth | Users, password hashing (scrypt), session cookie | DB |
| Web app | Kasumi UI: shell, list view, record page, setup, reports, dashboards, calendar, search | API |

## Data, errors, storage

Local SQLite file via Node's built-in `node:sqlite` (no native deps). Records live in one table with a
JSON data column plus system columns (id, object, owner, timestamps, deleted_at). Setup is data in
metadata tables. The dev DB is created by this app and seeded with demo data; reset is a script.

Errors: validation failures return field-level messages shown inline on the form; save failures keep
the form open with the user's input; every mutation in the UI has success and error handling.

## Research input (REA)

The user signs in to their own Salesforce Developer Edition org in a throwaway debug Chrome; REA
records page structure and network calls passively. Output: field lists per object, page structure,
flow steps — written to `docs/research/`. Behaviour only; no code, assets, copy or brand copied.
Building does not wait on it; findings adjust fields/layouts as they arrive.

## Testing

Unit tests (node:test) for: expression engine, query compiler, validation, formulas/roll-ups, sharing,
automation, lead conversion, reports aggregation, CSV import, field history. A few Playwright specs for
the core journeys (sign in → create lead → convert → move opportunity on kanban → report). Memory
budget: one test run at a time, at most 2–3 browser tabs.

## Assumptions

- One company, several users (not multi-tenant). Default org-wide sharing: Public Read/Write.
- Single currency. Scale: thousands to tens of thousands of records per object — SQLite JSON is enough.
- Name, brand and palette come from YAC HQ later; until then a neutral name and Kasumi defaults.
