import { PageHeader, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, useNotifications } from "@kasumi/ui";
import { api } from "@/api.js";
import { COPY } from "@/copy.js";
import { invalidateMeta, useSession } from "@/hooks.js";

export default function Sharing() {
  const { notify } = useNotifications();
  const { objects, reloadObjects } = useSession();
  const change = (o, sharing) => api(`/meta/objects/${o.name}`, { method: "PATCH", body: { sharing } }).then(
    () => { invalidateMeta(); reloadObjects(); notify(COPY.SETUP.SHARING_SAVED(o.label), "success"); },
    (err) => notify(err.message, "error"),
  );
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={COPY.SETUP.SHARING} subtitle={COPY.SETUP.SHARING_SUBTITLE} showSubtitleOnPhone />
      <Table containerClassName="rounded-card border border-line">
        <TableHead><TableRow><TableHeader>{COPY.SETUP.OBJECT}</TableHeader><TableHeader>{COPY.SETUP.SHARING}</TableHeader></TableRow></TableHead>
        <TableBody>
          {objects.map((o) => (
            <TableRow key={o.name}>
              <TableCell>{o.plural}</TableCell>
              <TableCell>
                <Select fieldSize="sm" aria-label={`${COPY.SETUP.SHARING}: ${o.plural}`} value={o.sharing} onChange={(e) => change(o, e.target.value)}>
                  {Object.entries(COPY.SETUP.SHARING_LEVELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
