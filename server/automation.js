import { ymd, addDays } from "../shared/dates.js";
import { listAutomations } from "./metadata.js";
import { createRecord, updateRecord, ValidationError, cachedCompile } from "./records.js";

function matches(rule, before, after, today) {
  const crit = cachedCompile(rule.criteria);
  if (!crit(after, { prior: before, isNew: !before, today })) return false;
  if (!before) return rule.trigger !== "update";
  if (rule.trigger === "create") return false;
  return !crit(before, { isNew: false, today });
}

export function runAutomations(ctx, object, before, after) {
  const today = ctx.today ?? new Date();
  let current = after;
  for (const rule of listAutomations(ctx.db, object).filter((r) => r.active)) {
    if (!matches(rule, before, current, today)) continue;
    const patch = {};
    for (const action of rule.actions) {
      if (action.type === "set_field") {
        patch[action.field] = cachedCompile(action.value)(current, { prior: before, isNew: !before, today });
      } else if (action.type === "create_task") {
        const link = ["contact", "lead"].includes(object) ? { who: current.id } : { what: current.id };
        createRecord(ctx, "task", {
          subject: action.subject, due_date: ymd(addDays(today, Number(action.dueInDays ?? 0))), status: "Not Started", ...link,
          ownerId: action.assignTo === "owner" || !action.assignTo ? current.ownerId : action.assignTo,
        }, { system: true, skipAutomation: true });
      }
    }
    if (Object.keys(patch).length) {
      try {
        current = updateRecord(ctx, object, current.id, patch, { system: true, skipAutomation: true });
      } catch (err) {
        if (!(err instanceof ValidationError)) throw err;
        const [field, message] = Object.entries(err.errors)[0];
        throw new ValidationError({ _record: `Automation "${rule.name}" could not set ${field}: ${message}` });
      }
    }
  }
}
