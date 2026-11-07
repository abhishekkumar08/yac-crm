# yac-crm — Salesforce parity, round 2

Status: approved scope · 2026-10-22 · extends `2026-10-22-crm-design.md`

## Goal
Close the remaining gaps so the CRM works like Salesforce Sales + Service. Behaviour and structure match;
visuals stay Kasumi (company rule, REA terms, trade-dress risk). Name, logo and palette come from YAC HQ.

## Scope

| Area | Behaviour |
|---|---|
| Chatter | Feed per record (Chatter tab): posts, comments, likes, @mentions of users. Tracked-field posts for stage, status, owner, amount, priority. Follow/Unfollow records. Chatter page: What I Follow / To Me / All Company. Notifications bell (mentions, approvals assigned, record shared via owner change). |
| Approvals | Setup → Approval Processes per object: name, entry criteria (formula), approver = submitter's manager (user above in role tree) or named user, lock record while pending, final approve / reject field updates. Records: Submit for Approval, Approve / Reject / Recall with comment, Approval History related list. Home: Items to Approve. Pending records are read-only except to admins and the approver. One active process per object, evaluated in order. |
| Email | Send Email on records with an email-bearing person (contact, lead) or linked person (account → contacts, opportunity/case → contact): To, CC, BCC, subject, body, template picker. Templates in Setup with merge fields `{!Object.Field}` from the record, its account/contact and the sender. Each send logs an Email activity (status Sent / Failed) on the record. Delivery: local outbox by default; SMTP when an admin enables it in Setup → Deliverability (host, port, secure, user, from); password only from env `CRM_SMTP_PASSWORD`. Outbox page lists messages. |
| Multi-currency | Setup → Currencies: corporate currency + active currencies with rate to corporate. When enabled, every record has Record Currency (default: user's default currency = corporate). Currency fields render in record currency, with corporate value in brackets when different. Roll-ups, reports, forecast and home performance convert to corporate. Line items and quotes take the opportunity's currency. Fixed rates (no dated rates). |
| Files | Upload to any record (≤ 10 MB each, stored under `data/files`), Files related list, download, delete to recycle bin semantics (soft). |
| Mobile | All pages usable at 375 px; phone bottom bar for main tabs; web app manifest. |
| Fidelity | Stage History related list (opportunity field history of stage, amount, close date); Home Assistant card (overdue tasks, opportunities closing within 7 days with no activity in 14 days, leads not contacted in 7 days); New Case / New Note quick actions on account and contact. |

## Approach
Extend the existing engine, not new subsystems: feed items, approvals, emails, files and currencies are new tables
with small services; record pages gain tabs/actions; the save pipeline gains two hooks (lock check before save,
feed tracking after save). Email delivery is one interface with two transports (outbox, SMTP).

## Non-goals
Salesforce visual skin, name or logo; native mobile apps; AI features; dated exchange rates; approval queues and
multi-step approval chains; email inbox sync.

## Testing
node:test for each service (feed, approvals incl. lock + manager resolution, merge fields, transports with a fake
SMTP transport, currency conversion in roll-ups/reports, files size limit). Playwright: post + mention, submit and
approve, send email to outbox, phone-width smoke. No test sends real email.
