import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, EmptyState, ErrorState, LoadingTable, PageHeader, SegmentedControl, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TextLink } from "@kasumi/ui";
import { BarChart3, Plus } from "lucide-react";
import { COPY } from "@/copy.js";
import { useApi, useSession } from "@/hooks.js";
import { formatDateTime } from "@/format.js";

export default function Reports() {
  const navigate = useNavigate();
  const { objects, user } = useSession();
  const [show, setShow] = useState("all");
  const { data: all, error, loading, reload } = useApi("/reports");
  const data = all && (show === "mine" ? all.filter((r) => r.ownerId === user.id) : all);
  const label = (name) => objects.find((o) => o.name === name)?.plural ?? name;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={COPY.REPORTS.TITLE} action={<Button onClick={() => navigate("/reports/new")}><Plus aria-hidden="true" className="h-4 w-4" />{COPY.REPORTS.NEW}</Button>}>
        <SegmentedControl label={COPY.REPORTS.SHOW} value={show} onChange={setShow}
          options={[{ value: "all", label: COPY.REPORTS.ALL }, { value: "mine", label: COPY.REPORTS.MINE }]} />
      </PageHeader>
      {error && <ErrorState message={error.message} onRetry={reload} retryLabel={COPY.COMMON.RETRY} />}
      {loading && !data && <LoadingTable rows={4} cols={4} />}
      {data && data.length === 0 && <EmptyState icon={BarChart3} title={COPY.REPORTS.EMPTY} action={() => navigate("/reports/new")} actionLabel={COPY.REPORTS.NEW} />}
      {data && data.length > 0 && (
        <Table containerClassName="rounded-card border border-line">
          <TableHead><TableRow>
            <TableHeader>{COPY.REPORTS.NAME}</TableHeader><TableHeader>{COPY.REPORTS.OBJECT}</TableHeader>
            <TableHeader>{COPY.REPORTS.OWNER}</TableHeader><TableHeader>{COPY.REPORTS.UPDATED}</TableHeader>
          </TableRow></TableHead>
          <TableBody>
            {data.map((r) => (
              <TableRow key={r.id}>
                <TableCell description={r.description}><TextLink as={Link} to={`/reports/${r.id}`}>{r.name}</TextLink></TableCell>
                <TableCell>{label(r.def.object)}</TableCell><TableCell>{r.ownerName}</TableCell><TableCell>{formatDateTime(r.updatedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
