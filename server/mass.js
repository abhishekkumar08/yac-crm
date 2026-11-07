import { tx } from "./db.js";
import { QueryError } from "./query.js";
import { createRecord, deleteRecord, updateRecord } from "./records.js";

const CAMPAIGN_OBJECTS = new Set(["lead", "contact"]);

function addToCampaign(ctx, object, id, campaignId) {
  if (!CAMPAIGN_OBJECTS.has(object)) throw new QueryError("Only leads and contacts can join a campaign.");
  const existing = ctx.db.prepare(`SELECT 1 FROM records WHERE object = 'campaign_member' AND deleted_at IS NULL
    AND json_extract(data, '$.campaign') = ? AND json_extract(data, ?) = ?`).get(campaignId, `$.${object}`, id);
  if (existing) throw new Error("This record is already a member of the campaign.");
  createRecord(ctx, "campaign_member", { campaign: campaignId, [object]: id });
}

const ACTIONS = {
  delete: (ctx, object, id) => deleteRecord(ctx, object, id),
  owner: (ctx, object, id, body) => updateRecord(ctx, object, id, { ownerId: body.ownerId }),
  set: (ctx, object, id, body) => updateRecord(ctx, object, id, body.values ?? {}),
  add_to_campaign: (ctx, object, id, body) => addToCampaign(ctx, object, id, body.campaignId),
};

export function massUpdate(ctx, object, body) {
  const run = ACTIONS[body.action];
  if (!run) throw new QueryError("Unknown mass action.");
  const out = { ok: [], failed: [] };
  tx(ctx.db, () => (body.ids ?? []).forEach((id) => {
    try {
      tx(ctx.db, () => run(ctx, object, id, body));
      out.ok.push(id);
    } catch (err) {
      if (err instanceof QueryError) throw err;
      out.failed.push({ id, error: err.message });
    }
  }));
  return out;
}
