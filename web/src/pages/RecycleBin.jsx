import { Button, EmptyState, ErrorState, LoadingTable, PageHeader, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, useNotifications } from "@kasumi/ui";
import { Trash2 } from "lucide-react";
import { api } from "@/api.js";
import { COPY } from "@/copy.js";
import { useApi } from "@/hooks.js";
import { formatDateTime } from "@/format.js";

export default function RecycleBin() {
  const { notify } = useNotifications();
  const { data, error, loading, reload } = useApi("/recycle-bin");
  const restore = (row) => api(`/recycle-bin/${row.id}/restore`, { method: "POST" }).then(
    () => { notify(COPY.BIN.RESTORED(row.name ?? row.id), "success"); reload(); },
    (err) => notify(err.message, "error"),
  );
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={COPY.BIN.TITLE} subtitle={COPY.BIN.SUBTITLE} showSubtitleOnPhone />
      {error && <ErrorState message={error.message} onRetry={reload} retryLabel={COPY.COMMON.RETRY} />}
      {loading && !data && <LoadingTable rows={5} cols={4} />}
      {data && data.length === 0 && <EmptyState icon={Trash2} title={COPY.BIN.EMPTY} />}
      {data && data.length > 0 && (
        <Table containerClassName="rounded-card border border-line">
          <TableHead><TableRow>
            <TableHeader>{COPY.BIN.NAME}</TableHeader><TableHeader>{COPY.BIN.TYPE}</TableHeader>
            <TableHeader>{COPY.BIN.DELETED_BY}</TableHeader><TableHeader>{COPY.BIN.DELETED_AT}</TableHeader><TableHeader><span className="sr-only">{COPY.BIN.RESTORE}</span></TableHeader>
          </TableRow></TableHead>
          <TableBody>
            {data.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.name || r.id}</TableCell><TableCell>{r.objectLabel}</TableCell>
                <TableCell>{r.deletedByName}</TableCell><TableCell>{formatDateTime(r.deletedAt)}</TableCell>
                <TableCell><Button size="xs" variant="secondary" onClick={() => restore(r)}>{COPY.BIN.RESTORE}</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
