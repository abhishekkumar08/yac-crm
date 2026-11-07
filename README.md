# YAC CRM

A YAC product (working name — the real name comes from YAC HQ). A CRM that works the way Salesforce Sales and
Service do: accounts, contacts, leads, opportunities with a pipeline board, products, price books and quotes, campaigns,
cases, tasks and events, Chatter (posts, mentions, follows, notifications), approval processes, email with templates,
multiple currencies, files on records, reports, dashboards and forecasts, and a Setup area for objects, fields, layouts,
rules, automation, users, roles and sharing. Works on phones too. UI is the shared Kasumi design system; behaviour
matches Salesforce, the look does not copy it. Everything runs locally.

## Run it

```bash
npm install
npm start            # API on 127.0.0.1:4400 + web on http://localhost:5180 (opens the browser)
```

Needs Node 22.13+ (uses the built-in `node:sqlite`). The first start creates `data/crm.db` with demo data.

| Demo login | Who |
|---|---|
| `admin@yac.local` | Admin (sees everything, opens Setup) |
| `manager@yac.local` | Sales manager (sees reps' private records) |
| `rep1@yac.local`, `rep2@yac.local` | Sales reps |
| `support@yac.local` | Support agent |

Password for all: `demo1234` (local demo data only).

```bash
npm run reset-db     # keeps the old DB as data/crm.db.bak-<time>, then seeds a fresh one
npm test             # unit + API tests (node:test)
npm run e2e          # Playwright journeys against a production build and a throwaway DB
npm run lint
npm run build        # web build into dist/, served by the API when present
```

## How it is built

| Part | Where | What it does |
|---|---|---|
| Record engine | `server/records.js` | One save pipeline for every object: types, defaults, lookups, required/unique, formulas, validation rules, autonumbers, roll-ups, field history, soft delete + recycle bin, automation |
| Metadata | `server/metadata.js`, `server/standard-objects.js` | Objects, fields, page layouts, list views, rules — standard objects are seeded metadata, custom objects use the same path |
| Formula language | `server/expr.js` | Safe parser/evaluator (no `eval`) for formula fields, validation rules and automation criteria |
| Filters | `server/query.js` | List-view / report filters → parameterised SQL over JSON record data, date literals like `THIS_QUARTER` |
| Sharing | `server/sharing.js` | Org-wide defaults (public read/write, read only, private) + role hierarchy |
| Flows | `server/convert.js`, `server/quotes.js`, `server/automation.js` | Lead conversion, quote from opportunity, record-triggered rules |
| Insight | `server/reports.js`, `server/csv.js` | Reports (grouping, summaries), dashboards, forecast, search, CSV import/export |
| API | `server/app.js` | REST under `/api`, session cookie, JSON-only mutations |
| Web | `web/src` | React + Kasumi; generic list view and record page for any object, plus purpose-built screens |

## Reference research

`docs/research/salesforce-observation.md`: what was observed (behaviour and structure only) from a Salesforce
Developer Edition org with the REA tool, and which gaps were closed.

## Email

Email goes to a local outbox (user menu → Email Outbox) until an admin turns on SMTP in Setup → Deliverability.
The SMTP password is never stored: start the server with it in the environment.

```bash
CRM_SMTP_PASSWORD='app-password' npm start
```

## Not done yet

- Product name, logo and palette — pending YAC HQ.
- Native iOS/Android apps (the web app works on phones and can be installed from the browser).
- AI features, approval queues and multi-step approval chains, inbox sync, dated exchange rates.
- Reports aggregate up to 2,000 rows in memory; large datasets would need SQL grouping.
