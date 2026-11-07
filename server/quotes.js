import { tx } from "./db.js";
import { ymd, addDays } from "../shared/dates.js";
import { createRecord, getRecord, listRecords } from "./records.js";


export function createQuote(ctx, opportunityId, { name } = {}) {
  const today = ctx.today ?? new Date();
  return tx(ctx.db, () => {
    const opp = getRecord(ctx, "opportunity", opportunityId);
    const quote = createRecord(ctx, "quote", {
      name: name || `${opp.name} Quote`, opportunity: opp.id, account: opp.account, contact: opp.contact,
      status: "Draft", expiration_date: ymd(addDays(today, 30)),
    });
    const items = listRecords(ctx, "opportunity_line_item",
      { filters: [{ field: "opportunity", op: "eq", value: opp.id }], limit: 2000, sort: { field: "created_at", dir: "asc" } });
    for (const li of items.records) {
      createRecord(ctx, "quote_line_item", {
        quote: quote.id, product: li.product, quantity: li.quantity, unit_price: li.unit_price,
        discount: li.discount, description: li.description,
      });
    }
    return getRecord(ctx, "quote", quote.id);
  });
}
