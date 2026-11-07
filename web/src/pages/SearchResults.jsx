import { Link, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, EmptyState, ErrorState, LoadingCard, PageHeader, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TextLink, Badge } from "@kasumi/ui";
import { Search } from "lucide-react";
import { qs } from "@/api.js";
import { COPY } from "@/copy.js";
import { useApi, useObjectMeta } from "@/hooks.js";
import FieldValue from "@/records/FieldValue.jsx";

function Group({ group, q }) {
  const { meta } = useObjectMeta(group.object);
  if (!meta) return <LoadingCard />;
  const byName = new Map(meta.fields.map((f) => [f.name, f]));
  const cols = (meta.views[0]?.columns ?? []).map((c) => byName.get(c)).filter(Boolean).slice(0, 5);
  return (
    <Card padding="none">
      <CardHeader className="flex flex-row items-center gap-2 px-card pt-card">
        <CardTitle as="h2">{group.plural}</CardTitle><Badge size="count">{group.total}</Badge>
      </CardHeader>
      <CardContent className="px-card pb-card">
        <Table>
          <TableHead><TableRow>{cols.map((f) => <TableHeader key={f.name}>{f.label}</TableHeader>)}</TableRow></TableHead>
          <TableBody>
            {group.records.map((r) => (
              <TableRow key={r.id}>
                {cols.map((f, i) => <TableCell key={f.name}>{i === 0 ? <TextLink as={Link} to={`/r/${group.object}/${r.id}`}>{r.name || r.id}</TextLink> : <FieldValue field={f} record={r} />}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {group.total > group.records.length && (
          <div className="mt-2"><TextLink as={Link} to={`/o/${group.object}${qs({ q })}`}>{COPY.SEARCH.MORE(group.total, group.plural)}</TextLink></div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SearchResults() {
  const [params] = useSearchParams();
  const q = params.get("q") ?? "";
  const { data, error, loading, reload } = useApi(q ? `/search${qs({ q, limit: 10 })}` : null);
  if (!q) return <EmptyState icon={Search} title={COPY.SEARCH.PROMPT} />;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={COPY.SEARCH.TITLE(q)} />
      {error && <ErrorState message={error.message} onRetry={reload} retryLabel={COPY.COMMON.RETRY} />}
      {loading && <LoadingCard />}
      {data && data.length === 0 && <EmptyState icon={Search} title={COPY.SEARCH.EMPTY} />}
      {data?.map((g) => <Group key={g.object} group={g} q={q} />)}
    </div>
  );
}
