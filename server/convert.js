import { tx } from "./db.js";
import { ymd, addDays } from "../shared/dates.js";
import { createRecord, updateRecord, getRecord, listRecords, ValidationError } from "./records.js";
import { getObject } from "./metadata.js";
import { assertUnlocked } from "./approvals.js";

const ADDRESS = ["street", "city", "state", "postal_code", "country"];
const copy = (src, pairs) => Object.fromEntries(pairs.map(([to, from]) => [to, src[from]]).filter(([, v]) => v !== null && v !== undefined));

const isConvertedStatus = (field, value) => (field.picklist ?? []).includes(value) && /\bConverted\b/.test(value)
  && !/\bNot Converted\b/.test(value);

export function convertLead(ctx, leadId, {
  accountId, accountName, contactId, opportunityId, createOpportunity = true, opportunityName, ownerId,
  convertedStatus = "Closed - Converted",
} = {}) {
  const today = ctx.today ?? new Date();
  return tx(ctx.db, () => {
    const lead = getRecord(ctx, "lead", leadId);
    if (lead.is_converted) throw new ValidationError({ _record: "This lead is already converted." });
    assertUnlocked(ctx, lead.id);
    const statusField = getObject(ctx.db, "lead").fields.find((f) => f.name === "status");
    if (!isConvertedStatus(statusField, convertedStatus)) throw new ValidationError({ status: "Choose a converted status." });
    const owner = ownerId ?? lead.ownerId;

    const account = accountId
      ? getRecord(ctx, "account", accountId)
      : createRecord(ctx, "account", {
        name: accountName || lead.company, ownerId: owner,
        ...copy(lead, [["phone", "phone"], ["website", "website"], ["industry", "industry"], ["rating", "rating"],
          ["annual_revenue", "annual_revenue"], ["number_of_employees", "number_of_employees"],
          ...ADDRESS.map((p) => [`billing_${p}`, `address_${p}`])]),
      });

    const contact = contactId
      ? getRecord(ctx, "contact", contactId)
      : createRecord(ctx, "contact", {
        account: account.id, ownerId: owner,
        ...copy(lead, [["salutation", "salutation"], ["first_name", "first_name"], ["last_name", "last_name"],
          ["title", "title"], ["email", "email"], ["phone", "phone"], ["mobile_phone", "mobile_phone"],
          ["lead_source", "lead_source"], ["description", "description"],
          ...ADDRESS.map((p) => [`mailing_${p}`, `address_${p}`])]),
      });

    const opportunity = opportunityId ? getRecord(ctx, "opportunity", opportunityId) : createOpportunity
      ? createRecord(ctx, "opportunity", {
        name: opportunityName || `${account.name}-`, account: account.id, contact: contact.id, ownerId: owner,
        close_date: ymd(addDays(today, 30)), stage: "Prospecting", ...copy(lead, [["lead_source", "lead_source"]]),
      })
      : null;

    for (const object of ["task", "event"]) {
      for (const act of listRecords(ctx, object, { filters: [{ field: "who", op: "eq", value: lead.id }], limit: 2000 }).records) {
        updateRecord(ctx, object, act.id, { who: contact.id, what: act.what ?? account.id }, { system: true, skipAutomation: true });
      }
    }
    for (const note of listRecords(ctx, "note", { filters: [{ field: "what", op: "eq", value: lead.id }], limit: 2000 }).records) {
      updateRecord(ctx, "note", note.id, { what: contact.id }, { system: true, skipAutomation: true });
    }
    for (const m of listRecords(ctx, "campaign_member", { filters: [{ field: "lead", op: "eq", value: lead.id }], limit: 2000 }).records) {
      updateRecord(ctx, "campaign_member", m.id, { contact: contact.id }, { system: true, skipAutomation: true });
    }

    updateRecord(ctx, "lead", lead.id, {
      status: convertedStatus, is_converted: true, converted_date: ymd(today), converted_account: account.id,
      converted_contact: contact.id, converted_opportunity: opportunity?.id ?? null,
    }, { system: true });

    return { accountId: account.id, contactId: contact.id, opportunityId: opportunity?.id ?? null };
  });
}
