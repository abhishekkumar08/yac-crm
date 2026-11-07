import { Badge, Card, CardContent, CardHeader, CardTitle, List, ListRow } from "@kasumi/ui";
import { COPY } from "@/copy.js";
import { formatDateTime } from "@/format.js";

const TONE = { pending: "warning", approved: "success", rejected: "error", recalled: "neutral" };

export default function ApprovalHistory({ history }) {
  return (
    <Card padding="none">
      <CardHeader className="px-card pt-card"><CardTitle as="h3">{COPY.APPROVAL.HISTORY}</CardTitle></CardHeader>
      <CardContent className="px-card pb-card">
        {history.length === 0 && <p className="text-body text-fg-muted">{COPY.APPROVAL.HISTORY_EMPTY}</p>}
        {history.map((req) => (
          <div key={req.id} className="mb-3">
            <Badge tone={TONE[req.status]}>{COPY.APPROVAL.STATUS[req.status]}</Badge>
            <List>
              {req.steps.map((s, i) => (
                <ListRow key={i} title={`${COPY.APPROVAL.ACTIONS[s.action]} · ${s.actorName ?? ""}`} description={s.comment ?? undefined} meta={formatDateTime(s.at)} />
              ))}
            </List>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
