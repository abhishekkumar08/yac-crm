import { tx, now } from "./db.js";
import { ymd, addDays } from "../shared/dates.js";
import { hashPassword } from "./auth.js";
import { seedMetadata, createAutomation } from "./metadata.js";
import { createRecord, updateRecord } from "./records.js";
import { saveReport, saveDashboard } from "./reports.js";
import { saveProcess } from "./approvals.js";
import { saveTemplate } from "./email.js";

export const DEMO_PASSWORD = "demo1234";

const ROLES = [
  ["00E000000000001", "CEO", null],
  ["00E000000000002", "VP Sales", "00E000000000001"],
  ["00E000000000003", "Sales Manager", "00E000000000002"],
  ["00E000000000004", "Sales Rep", "00E000000000003"],
  ["00E000000000005", "Support Manager", "00E000000000001"],
  ["00E000000000006", "Support Agent", "00E000000000005"],
];

const USERS = [
  ["005000000000001", "Ada Admin", "admin@yac.local", "00E000000000001", "admin"],
  ["005000000000002", "Max Mehta", "manager@yac.local", "00E000000000003", "standard"],
  ["005000000000003", "Riya Rao", "rep1@yac.local", "00E000000000004", "standard"],
  ["005000000000004", "Sam Singh", "rep2@yac.local", "00E000000000004", "standard"],
  ["005000000000005", "Sana Shah", "support@yac.local", "00E000000000006", "standard"],
];

function rng(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PREFIX = ["Blue", "North", "Silver", "Bright", "Granite", "Cedar", "Summit", "Harbor", "Pine", "Lumen", "Vertex",
  "Nimbus", "Atlas", "Orbit", "Quartz", "Maple", "Iron", "Coral", "Delta", "Juniper"];
const SUFFIX = ["Labs", "Systems", "Foods", "Logistics", "Health", "Energy", "Retail", "Media", "Works", "Finance"];
const FIRST = ["Aarav", "Bea", "Chen", "Dina", "Eli", "Farah", "Gus", "Hana", "Ivan", "Jia", "Kofi", "Lena", "Mateo",
  "Nia", "Omar", "Priya", "Quinn", "Rosa", "Tomas", "Uma", "Vik", "Wen", "Yusuf", "Zara"];
const LAST = ["Arora", "Brooks", "Costa", "Diaz", "Evans", "Fischer", "Gupta", "Hughes", "Iyer", "Jensen", "Khan",
  "Lopez", "Moreau", "Nair", "Okafor", "Patel", "Quist", "Reyes", "Sato", "Tan", "Usman", "Varga", "Weber", "Young"];
const CITIES = [["Bengaluru", "Karnataka", "India"], ["Mumbai", "Maharashtra", "India"], ["Austin", "TX", "USA"],
  ["Berlin", "Berlin", "Germany"], ["Singapore", "Singapore", "Singapore"], ["Toronto", "ON", "Canada"]];
const TITLES = ["CEO", "CFO", "VP Operations", "Head of IT", "Procurement Lead", "Director of Sales", "Engineering Manager"];
const PRODUCTS = [
  ["Starter Plan", "SUB-ST", "Subscription", 1200], ["Growth Plan", "SUB-GR", "Subscription", 4800],
  ["Enterprise Plan", "SUB-EN", "Subscription", 18000], ["Onboarding Package", "SRV-ON", "Services", 3500],
  ["Training Day", "SRV-TR", "Services", 1500], ["Edge Gateway", "HW-EG", "Hardware", 900],
  ["Analytics Add-on", "SW-AN", "Software", 2400], ["Premium Support", "SRV-PS", "Services", 6000],
];

export function seedDemo(db, { records = true, today = new Date() } = {}) {
  seedMetadata(db);
  if (db.prepare("SELECT count(*) AS n FROM users").get().n > 0) return;
  tx(db, () => {
    for (const r of ROLES) db.prepare("INSERT INTO roles (id, name, parent_id) VALUES (?, ?, ?)").run(...r);
    const hash = hashPassword(DEMO_PASSWORD);
    for (const [id, name, email, roleId, profile] of USERS) {
      db.prepare("INSERT INTO users (id, name, email, password_hash, role_id, profile, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(id, name, email, hash, roleId, profile, now());
    }
  });
  if (records) seedRecords(db, today);
}

function seedRecords(db, today) {
  const rand = rng(42);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const day = (offset) => ymd(addDays(today, offset));
  const at = (offset, hour, minute = 0) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset, hour, minute).toISOString();
  const userCtx = (id) => ({ db, user: { id, profile: id === USERS[0][0] ? "admin" : "standard", roleId: USERS.find((u) => u[0] === id)[3] } });
  const admin = userCtx(USERS[0][0]);
  const sellers = [USERS[0][0], USERS[1][0], USERS[2][0], USERS[3][0]];
  const support = USERS[4][0];

  tx(db, () => {
    const book = createRecord(admin, "pricebook", { name: "Standard Price Book", is_active: true });
    updateRecord(admin, "pricebook", book.id, { is_standard: true }, { system: true });
    const products = PRODUCTS.map(([name, code, family, price]) => {
      const p = createRecord(admin, "product", { name, product_code: code, family, is_active: true });
      createRecord(admin, "pricebook_entry", { pricebook: book.id, product: p.id, unit_price: price, is_active: true });
      return { ...p, price };
    });

    const accounts = [];
    const used = new Set();
    while (accounts.length < 40) {
      const name = `${pick(PREFIX)} ${pick(SUFFIX)}`;
      if (used.has(name)) continue;
      used.add(name);
      const [city, state, country] = pick(CITIES);
      accounts.push(createRecord(userCtx(pick(sellers)), "account", {
        name, type: pick(["Prospect", "Customer - Direct", "Customer - Channel", "Technology Partner"]),
        industry: pick(["Technology", "Retail", "Healthcare", "Finance", "Manufacturing", "Energy", "Media"]),
        rating: pick(["Hot", "Warm", "Cold"]), phone: `+1 555 ${between(100, 999)} ${between(1000, 9999)}`,
        website: `https://www.${name.toLowerCase().replace(/\s+/g, "")}.example`, annual_revenue: between(5, 900) * 100000,
        number_of_employees: between(10, 5000), billing_city: city, billing_state: state, billing_country: country,
      }));
    }

    const contacts = [];
    for (const acc of accounts) {
      for (let i = 0; i < 2; i++) {
        const first = pick(FIRST), last = pick(LAST);
        contacts.push(createRecord(userCtx(acc.ownerId), "contact", {
          first_name: first, last_name: last, account: acc.id, title: pick(TITLES),
          email: `${first}.${last}${between(1, 99)}@${acc.name.toLowerCase().replace(/\s+/g, "")}.example`.toLowerCase(),
          phone: `+1 555 ${between(100, 999)} ${between(1000, 9999)}`, lead_source: pick(["Web", "Partner Referral", "Trade Show"]),
          mailing_city: acc.billing_city, mailing_country: acc.billing_country,
        }));
      }
    }

    const campaigns = ["Spring Webinar Series", "Partner Summit", "Q3 Email Nurture", "Trade Show Booth"].map((name, i) =>
      createRecord(userCtx(USERS[1][0]), "campaign", {
        name, type: ["Webinar", "Conference", "Email", "Trade Show"][i], status: ["Completed", "In Progress", "In Progress", "Planned"][i],
        is_active: i > 0, start_date: day(-60 + i * 30), end_date: day(-30 + i * 30), budgeted_cost: between(5, 40) * 1000,
        expected_revenue: between(50, 300) * 1000,
      }));

    const leads = [];
    for (let i = 0; i < 60; i++) {
      const first = pick(FIRST), last = pick(LAST);
      const company = `${pick(PREFIX)} ${pick(["Studio", "Group", "Partners", "Co", "Ventures"])}`;
      leads.push(createRecord(userCtx(pick(sellers)), "lead", {
        first_name: first, last_name: last, company, title: pick(TITLES),
        email: `${first}.${last}@${company.toLowerCase().replace(/\s+/g, "")}.example`.toLowerCase(),
        phone: `+1 555 ${between(100, 999)} ${between(1000, 9999)}`,
        status: pick(["Open - Not Contacted", "Open - Not Contacted", "Working - Contacted", "Working - Contacted", "Closed - Not Converted"]),
        lead_source: pick(["Web", "Phone Inquiry", "Partner Referral", "Purchased List", "Trade Show"]),
        industry: pick(["Technology", "Retail", "Healthcare", "Finance"]), rating: pick(["Hot", "Warm", "Cold"]),
        address_city: pick(CITIES)[0],
      }));
    }
    for (let i = 0; i < 24; i++) {
      const member = i % 2 ? { lead: leads[i].id } : { contact: contacts[i].id };
      createRecord(admin, "campaign_member", { campaign: campaigns[i % 4].id, ...member, status: pick(["Sent", "Received", "Responded"]) });
    }

    const opps = [];
    for (let i = 0; i < 70; i++) {
      const acc = pick(accounts);
      const offset = between(-120, 150);
      const stage = offset < -10 ? pick(["Closed Won", "Closed Won", "Closed Lost"])
        : pick(["Prospecting", "Qualification", "Needs Analysis", "Value Proposition", "Id. Decision Makers",
          "Perception Analysis", "Proposal/Price Quote", "Negotiation/Review", ...(offset <= 0 ? ["Closed Won"] : [])]);
      const opp = createRecord(userCtx(acc.ownerId), "opportunity", {
        name: `${acc.name} - ${pick(["Expansion", "Renewal", "New Platform", "Pilot", "Upgrade"])}`, account: acc.id,
        contact: contacts.find((c) => c.account === acc.id)?.id, close_date: day(offset), stage,
        amount: between(10, 500) * 500, type: pick(["New Customer", "Existing Customer - Upgrade", "Existing Customer - Replacement"]),
        lead_source: pick(["Web", "Partner Referral", "Trade Show", "Phone Inquiry"]), pricebook: book.id,
        campaign: rand() < 0.3 ? pick(campaigns).id : undefined, next_step: pick(["Send proposal", "Demo with IT", "Legal review", "Pricing call", null]),
      });
      if (rand() < 0.35) {
        for (const p of [pick(products), pick(products)]) {
          createRecord(userCtx(acc.ownerId), "opportunity_line_item", {
            opportunity: opp.id, product: p.id, quantity: between(1, 20), unit_price: p.price, discount: pick([0, 0, 5, 10]),
          });
        }
      }
      if (opp.contact) {
        createRecord(userCtx(acc.ownerId), "opportunity_contact_role", {
          opportunity: opp.id, contact: opp.contact, role: pick(["Decision Maker", "Economic Buyer", "Evaluator"]), is_primary: true,
        });
      }
      opps.push(opp);
    }

    for (let i = 0; i < 30; i++) {
      const con = pick(contacts);
      createRecord(userCtx(support), "case", {
        subject: pick(["Cannot sign in", "Invoice question", "Gateway offline", "Data export fails", "Feature request: SSO",
          "Slow dashboard", "Billing address change", "Integration error 500"]),
        account: con.account, contact: con.id, status: pick(["New", "Working", "Working", "Escalated", "Closed", "Closed"]),
        priority: pick(["High", "Medium", "Medium", "Low"]), origin: pick(["Phone", "Email", "Web"]),
        type: pick(["Question", "Problem", "Feature Request"]), reason: pick(["Performance", "Breakdown", "Feedback", "Other"]),
      });
    }

    for (let i = 0; i < 60; i++) {
      const opp = pick(opps);
      const owner = opp.ownerId;
      createRecord(userCtx(owner), "task", {
        subject: pick(["Call", "Send proposal", "Follow up on pricing", "Book demo", "Send contract", "Check in"]),
        due_date: day(between(-10, 14)), status: pick(["Not Started", "In Progress", "Completed", "Completed"]),
        priority: pick(["High", "Normal", "Normal", "Low"]), type: pick(["Call", "Email", "Meeting", "Other"]),
        what: opp.id, who: opp.contact ?? undefined,
      });
    }
    for (let i = 0; i < 25; i++) {
      const opp = pick(opps);
      const offset = between(-7, 21);
      const hour = between(9, 16);
      createRecord(userCtx(opp.ownerId), "event", {
        subject: pick(["Discovery call", "Product demo", "Quarterly review", "Negotiation meeting", "Onsite visit"]),
        start: at(offset, hour), end: at(offset, hour, 45), location: pick(["Zoom", "Customer office", "HQ room 2"]),
        type: pick(["Meeting", "Call"]), what: opp.id, who: opp.contact ?? undefined,
      });
    }
    for (let i = 0; i < 10; i++) {
      const acc = pick(accounts);
      createRecord(userCtx(acc.ownerId), "note", { title: pick(["Kickoff notes", "Pricing feedback", "Org chart", "Risks"]),
        body: "Key points from the last conversation.", what: acc.id });
    }
  });

  const pipeline = saveReport(admin, { name: "Pipeline by Stage", description: "Open and closed deals by stage",
    def: { object: "opportunity", groupBy: ["stage"], aggregates: [{ fn: "sum", field: "amount" }], columns: ["name", "account", "amount", "close_date", "owner"], chart: "bar" } });
  const won = saveReport(admin, { name: "Closed Won by Owner", description: "Won revenue per rep",
    def: { object: "opportunity", filters: [{ field: "is_won", op: "eq", value: true }], groupBy: ["owner"],
      aggregates: [{ fn: "sum", field: "amount" }], columns: ["name", "amount", "close_date"], chart: "column" } });
  const cases = saveReport(admin, { name: "Open Cases by Priority", description: "Cases that are not closed",
    def: { object: "case", filters: [{ field: "status", op: "ne", value: "Closed" }], groupBy: ["priority"],
      aggregates: [{ fn: "count" }], columns: ["case_number", "subject", "status"], chart: "donut" } });
  const sources = saveReport(admin, { name: "Leads by Source", description: "Where leads come from",
    def: { object: "lead", groupBy: ["lead_source"], aggregates: [{ fn: "count" }], columns: ["name", "company", "status"], chart: "pie" } });
  saveDashboard(admin, { name: "Sales Overview", description: "Pipeline, wins, leads and support load", components: [
    { reportId: won.id, type: "metric", title: "Closed Won" },
    { reportId: pipeline.id, type: "bar", title: "Pipeline by Stage" },
    { reportId: won.id, type: "column", title: "Won by Rep" },
    { reportId: sources.id, type: "pie", title: "Leads by Source" },
    { reportId: cases.id, type: "donut", title: "Open Cases by Priority" },
  ] });
  saveTemplate(db, admin.user, { name: "Follow-up after meeting", object: "opportunity",
    subject: "Next steps for {!Opportunity.Name}",
    body: "Hi {!Contact.FirstName},\n\nThanks for your time today. As discussed, the next step is: {!Opportunity.NextStep}.\n\nBest,\n{!User.Name}" });
  saveTemplate(db, admin.user, { name: "Case received", object: "case",
    subject: "We're on it: case {!Case.CaseNumber}",
    body: "Hi {!Contact.FirstName},\n\nWe received your request \"{!Case.Subject}\" and will update you soon.\n\n{!User.Name}" });
  saveProcess(db, { object: "opportunity", name: "Large deal review", criteria: "amount >= 100000", approverType: "manager",
    lockRecord: true, approveActions: [{ field: "next_step", value: "'Approved for proposal'" }], rejectActions: [] });
  createAutomation(db, { object: "case", name: "Follow up on high-priority cases", trigger: "create_or_update",
    criteria: "ISPICKVAL(priority, 'High') && NOT(ISPICKVAL(status, 'Closed'))",
    actions: [{ type: "create_task", subject: "Call the customer about this case", dueInDays: 1, assignTo: "owner" }] });
}
