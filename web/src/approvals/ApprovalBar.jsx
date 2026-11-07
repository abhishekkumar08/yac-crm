import { Alert, Button, useNotifications } from "@kasumi/ui";
import { api } from "@/api.js";
import { COPY } from "@/copy.js";
import { useSession } from "@/hooks.js";

export default function ApprovalBar({ pending, onChanged }) {
  const { notify, promptAction } = useNotifications();
  const { user, isAdmin } = useSession();
  if (!pending) return null;
  const act = async (kind) => {
    const comment = await promptAction({ title: kind === "recall" ? COPY.APPROVAL.RECALL : COPY.APPROVAL[kind.toUpperCase()],
      description: COPY.APPROVAL.COMMENT, confirmText: kind === "recall" ? COPY.APPROVAL.RECALL : COPY.APPROVAL[kind.toUpperCase()], cancelText: COPY.COMMON.CANCEL });
    if (comment === null) return;
    const req = kind === "recall"
      ? api(`/approvals/${pending.id}/recall`, { method: "POST", body: { comment } })
      : api(`/approvals/${pending.id}/decide`, { method: "POST", body: { decision: kind, comment } });
    req.then(() => { notify(COPY.APPROVAL.DONE[kind], "success"); onChanged(); }, (err) => notify(err.message, "error"));
  };
  const canDecide = pending.approverId === user.id || isAdmin;
  const canRecall = pending.submittedBy === user.id || isAdmin;
  return (
    <Alert tone="warning" title={COPY.APPROVAL.WAITING(pending.approverName ?? "")} action={
      <div className="flex flex-wrap gap-2">
        {canDecide && <Button size="sm" onClick={() => act("approve")}>{COPY.APPROVAL.APPROVE}</Button>}
        {canDecide && <Button size="sm" variant="secondary" onClick={() => act("reject")}>{COPY.APPROVAL.REJECT}</Button>}
        {canRecall && <Button size="sm" variant="secondary" onClick={() => act("recall")}>{COPY.APPROVAL.RECALL}</Button>}
      </div>
    }>{COPY.APPROVAL.LOCKED}</Alert>
  );
}
