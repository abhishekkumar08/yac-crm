import { Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@kasumi/ui";
import { COPY } from "@/copy.js";
import { useApi } from "@/hooks.js";
import { formatDateTime } from "@/format.js";

const FIELDS = new Set(["stage", "amount", "close_date", "probability"]);

export default function StageHistory({ recordId, version }) {
  const { data } = useApi(`/records/opportunity/${recordId}/history?v=${version}`);
  const rows = (data ?? []).filter((h) => FIELDS.has(h.field));
  return (
    <Card padding="none">
      <CardHeader className="px-card pt-card"><CardTitle as="h3">{COPY.RECORD.STAGE_HISTORY}</CardTitle></CardHeader>
      <CardContent className="px-card pb-card">
        <Table>
          <TableHead><TableRow>
            <TableHeader>{COPY.RECORD.FIELD}</TableHeader><TableHeader>{COPY.RECORD.FROM}</TableHeader><TableHeader>{COPY.RECORD.TO}</TableHeader>
            <TableHeader>{COPY.RECORD.CHANGED_BY}</TableHeader><TableHeader>{COPY.RECORD.CHANGED_AT}</TableHeader>
          </TableRow></TableHead>
          <TableBody>
            {rows.length === 0 && <TableEmpty colSpan={5}>{COPY.RECORD.STAGE_HISTORY_EMPTY}</TableEmpty>}
            {rows.map((h) => (
              <TableRow key={h.id}>
                <TableCell>{h.fieldLabel}</TableCell><TableCell>{h.oldValue ?? COPY.COMMON.BLANK}</TableCell>
                <TableCell>{h.newValue ?? COPY.COMMON.BLANK}</TableCell><TableCell>{h.userName}</TableCell><TableCell>{formatDateTime(h.at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
