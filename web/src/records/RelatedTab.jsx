import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, CardContent, CardHeader, CardTitle, ErrorState, LoadingCard, Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, TextLink, Badge } from "@kasumi/ui";
import { Plus } from "lucide-react";
import { qs } from "@/api.js";
import { COPY } from "@/copy.js";
import { useApi, useObjectMeta } from "@/hooks.js";
import FieldValue from "@/records/FieldValue.jsx";
import RecordModal from "@/records/RecordModal.jsx";
import FilesCard from "@/records/FilesCard.jsx";

function RelatedList({ list, parent, onChanged }) {
  const { meta } = useObjectMeta(list.object);
  const [open, setOpen] = useState(false);
  if (!meta) return <LoadingCard />;
  const byName = new Map(meta.fields.map((f) => [f.name, f]));
  const cols = list.columns.map((c) => byName.get(c)).filter(Boolean);
  const viewAll = `/o/${list.object}${qs({ f: [{ field: list.field, op: "eq", value: parent.id }] })}`;
  return (
    <Card padding="none">
      <CardHeader className="flex flex-row items-center gap-2 px-card pt-card">
        <CardTitle as="h3">{list.label}</CardTitle>
        <Badge size="count">{list.total}</Badge>
        <Button size="xs" variant="secondary" className="ml-auto" onClick={() => setOpen(true)}>
          <Plus aria-hidden="true" className="h-3.5 w-3.5" />{COPY.COMMON.NEW}
        </Button>
      </CardHeader>
      <CardContent className="px-card pb-card">
        <Table>
          <TableHead><TableRow>{cols.map((f) => <TableHeader key={f.name}>{f.label}</TableHeader>)}</TableRow></TableHead>
          <TableBody>
            {list.records.length === 0 && <TableEmpty colSpan={cols.length}>{COPY.RECORD.RELATED_EMPTY}</TableEmpty>}
            {list.records.slice(0, 5).map((r) => (
              <TableRow key={r.id}>
                {cols.map((f, i) => (
                  <TableCell key={f.name}>
                    {i === 0 ? <TextLink as={Link} to={`/r/${list.object}/${r.id}`}>{r.name || r.id}</TextLink> : <FieldValue field={f} record={r} />}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {list.total > 5 && <div className="mt-2"><TextLink as={Link} to={viewAll}>{COPY.COMMON.VIEW_ALL}</TextLink></div>}
      </CardContent>
      <RecordModal meta={meta} open={open} onClose={() => setOpen(false)} initial={{ [list.field]: parent.id }}
        initialNames={{ [list.field]: parent.name }} onSaved={(_, { andNew }) => { if (!andNew) setOpen(false); onChanged(); }} />
    </Card>
  );
}

export default function RelatedTab({ object, record, version, onChanged }) {
  const { data, error, loading, reload } = useApi(`/records/${object}/${record.id}/related?v=${version}`);
  if (error) return <ErrorState message={error.message} onRetry={reload} retryLabel={COPY.COMMON.RETRY} />;
  if (loading && !data) return <LoadingCard />;
  return (
    <div className="flex flex-col gap-4">
      {data.map((list) => <RelatedList key={`${list.object}:${list.field}`} list={list} parent={record} onChanged={() => { reload(); onChanged(); }} />)}
      <FilesCard object={object} recordId={record.id} />
    </div>
  );
}
