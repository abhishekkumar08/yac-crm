import { Link } from "react-router-dom";
import { Badge, Disclosure, EmptyState, ErrorState, LoadingTable, PageHeader, TextLink } from "@kasumi/ui";
import { Mail } from "lucide-react";
import { COPY } from "@/copy.js";
import { useApi } from "@/hooks.js";
import { formatDateTime } from "@/format.js";

const E = COPY.EMAIL;

export default function Outbox() {
  const { data, error, loading, reload } = useApi("/outbox");
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={E.OUTBOX} subtitle={E.OUTBOX_SUBTITLE} showSubtitleOnPhone />
      {error && <ErrorState message={error.message} onRetry={reload} retryLabel={COPY.COMMON.RETRY} />}
      {loading && !data && <LoadingTable rows={4} cols={4} />}
      {data && data.length === 0 && <EmptyState icon={Mail} title={E.OUTBOX_EMPTY} />}
      {data?.map((m) => (
        <Disclosure key={m.id} variant="card" title={m.subject}
          description={`${E.TO}: ${m.to.join(", ")} · ${formatDateTime(m.sentAt)}`}
          meta={<Badge tone={m.status === "Sent" ? "success" : "error"}>{m.status} · {E.VIA[m.transport]}</Badge>}>
          <dl className="mb-3 grid gap-1 text-caption text-fg-muted sm:grid-cols-2">
            <div><dt className="inline">{E.FROM}: </dt><dd className="inline">{m.from}</dd></div>
            <div><dt className="inline">{E.RECORD}: </dt><dd className="inline"><TextLink as={Link} to={`/r/${m.object}/${m.recordId}`}>{m.recordName ?? m.recordId}</TextLink></dd></div>
            {m.cc.length > 0 && <div><dt className="inline">{E.CC}: </dt><dd className="inline">{m.cc.join(", ")}</dd></div>}
            {m.error && <div className="sm:col-span-2 text-error-fg"><dd>{m.error}</dd></div>}
          </dl>
          <p className="whitespace-pre-wrap text-body text-fg">{m.body}</p>
        </Disclosure>
      ))}
    </div>
  );
}
