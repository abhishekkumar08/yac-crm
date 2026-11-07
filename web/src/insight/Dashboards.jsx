import { Link, useNavigate } from "react-router-dom";
import { Button, Card, CardContent, CardDescription, CardTitle, EmptyState, ErrorState, LoadingCard, PageHeader, TextLink } from "@kasumi/ui";
import { LayoutDashboard, Plus } from "lucide-react";
import { COPY } from "@/copy.js";
import { useApi } from "@/hooks.js";
import { formatDateTime } from "@/format.js";

export default function Dashboards() {
  const navigate = useNavigate();
  const { data, error, loading, reload } = useApi("/dashboards");
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={COPY.DASHBOARDS.TITLE} action={<Button onClick={() => navigate("/dashboards/new")}><Plus aria-hidden="true" className="h-4 w-4" />{COPY.DASHBOARDS.NEW}</Button>} />
      {error && <ErrorState message={error.message} onRetry={reload} retryLabel={COPY.COMMON.RETRY} />}
      {loading && !data && <LoadingCard />}
      {data && data.length === 0 && <EmptyState icon={LayoutDashboard} title={COPY.DASHBOARDS.EMPTY} action={() => navigate("/dashboards/new")} actionLabel={COPY.DASHBOARDS.NEW} />}
      {data && data.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((d) => (
            <Card key={d.id}>
              <CardContent>
                <CardTitle as="h2"><TextLink as={Link} to={`/dashboards/${d.id}`}>{d.name}</TextLink></CardTitle>
                <CardDescription>{d.description}</CardDescription>
                <p className="mt-2 text-caption text-fg-muted">{d.ownerName} · {formatDateTime(d.updatedAt)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
