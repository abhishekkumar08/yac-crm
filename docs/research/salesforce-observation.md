# Reference CRM observation (2026-10-22)

How: REA 6.7.0 `inspect-web-page` (passive, accessibility tree + DOM metadata) against the user's own Salesforce
Developer Edition org, signed in by the user in a throwaway Chrome profile. Nothing was edited or submitted in the org.
Only behaviour and structure are recorded here — no code, assets, styling, copy blocks or org data.

## Navigation and list views
- Global header: search, favorites, global actions, setup, notifications, profile; app nav bar with app launcher + object tabs.
- List view header: view picker, pin view, New, object-specific mass actions, list view controls, display switcher
  (table / kanban), refresh, inline edit ("Edit List"), charts, filters; search-this-list box.
- Lead list mass actions: Import, Add to Campaign, Change Status. Case list: Change Owner.
- Default columns
  - All Opportunities: Name, Account Name, Amount, Close Date, Stage, Owner Alias.
  - All Open Leads: Name, Company, State/Province, Email, Lead Status, Created Date, Owner Alias.
  - All Open Cases: Case Number, Contact Name, Subject, Status, Priority, Date/Time Opened, Owner Alias.

## Home
Sections: Quarterly Performance (chart + goal), Assistant, Today's Events, Today's Tasks, Recent Records,
Key Deals – Recent Opportunities.

## Record page (opportunity)
- Header actions: Follow, Edit, New Case, New Note, Change Owner, more actions.
- Path across the stage picklist; when the record is closed the path offers "Change Closed Stage".
- Tabs: Activity, Details, Chatter, Related.
- Activity: Log a Call, New Task, New Event, Email; timeline with "Upcoming & Overdue" and past activity.
- Related lists: Stage History, Products, Notes & Attachments, Contact Roles, Partners.

## Lead conversion dialog
Three sections — Account, Contact, Opportunity — each "Create New" or "Choose Existing"; account name prefilled;
"Don't create an opportunity upon conversion"; Converted Status picker; Convert / Cancel.

## Reports home
Tabs: Recent, Created by Me, Private, Public, All Reports, folders, favorites; New Report, New Folder.

## Standard fields (Object Manager), compared with yac-crm
| Object | Present there, missing here (added) | Skipped, with reason |
|---|---|---|
| Opportunity | Private, Quantity (sum of product quantities) | Contract (no contracts object), Last Sync Time (quote sync), Opportunity Score (AI) |
| Account | Account Source | D&B / Data.com / NAICS / SIC / Einstein tier (data services) |
| Contact | Assistant, Asst. Phone, Home Phone, Other Phone, Fax, Fax Opt Out, Other Address | Individual, Gender Identity, Pronouns, Buyer Attributes, Stay-in-Touch (privacy/data products) |
| Lead | Do Not Call, Email Opt Out, Fax, Fax Opt Out | D&B / Data.com, Individual |
| Case | Parent Case, Web Company, Web Phone, Closed When Created | Asset, Business Hours, Contact Email/Phone (cross-object formulas) |
| New object | Opportunity Contact Role (opportunity, contact, role, primary) | Partners |

## Tool notes
- Captures show only requests made while REA is attached, so network paths were empty for already-loaded pages.
- Long Setup lists are virtualised; only the first ~30 rows appear per capture.
