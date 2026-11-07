import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Card, IconButton, Menu, TextLink, useNotifications } from "@kasumi/ui";
import { MoveRight } from "lucide-react";
import { api } from "@/api.js";
import { COPY } from "@/copy.js";
import { formatMoneyShort, toCorporate } from "@/format.js";
import FieldValue from "@/records/FieldValue.jsx";

const BLANK = "__blank__";

export default function Kanban({ meta, records, groupField, onMoved }) {
  const { notify } = useNotifications();
  const [over, setOver] = useState(null);
  const [moving, setMoving] = useState(null);
  const field = meta.fields.find((f) => f.name === groupField);
  const byName = new Map(meta.fields.map((f) => [f.name, f]));
  const cardFields = meta.layout.highlights.filter((n) => n !== groupField).map((n) => byName.get(n)).filter(Boolean).slice(0, 3);
  const sumField = meta.fields.find((f) => f.name === "amount" && f.type === "currency");
  const columns = [...field.picklist, BLANK];
  const grouped = new Map(columns.map((c) => [c, []]));
  for (const r of records) (grouped.get(r[groupField] ?? BLANK) ?? grouped.get(BLANK)).push(r);

  const move = (record, value) => {
    const next = value === BLANK ? null : value;
    if ((record[groupField] ?? null) === next) return;
    setMoving(record.id);
    onMoved({ ...record, [groupField]: next }, record);
    api(`/records/${meta.name}/${record.id}`, { method: "PATCH", body: { [groupField]: next } }).then(
      (saved) => { setMoving(null); onMoved(saved); notify(COPY.LIST.KANBAN_MOVED(saved.name, next ?? COPY.COMMON.BLANK), "success"); },
      (err) => { setMoving(null); onMoved(record); notify(err.message, "error"); },
    );
  };

  return (
    <div className="relative flex gap-3 overflow-x-auto pb-3">
      {columns.filter((c) => c !== BLANK || grouped.get(BLANK).length).map((col) => {
        const items = grouped.get(col);
        const total = sumField ? items.reduce((s, r) => s + toCorporate(r.amount, r.currency_iso_code), 0) : null;
        return (
          <section key={col} aria-label={col === BLANK ? COPY.COMMON.BLANK : col}
            className={`flex w-72 shrink-0 flex-col rounded-card border border-line bg-surface-subtle ${over === col ? "ring-2 ring-accent" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setOver(col); }} onDragLeave={() => setOver(null)}
            onDrop={(e) => { e.preventDefault(); setOver(null); const r = records.find((x) => x.id === e.dataTransfer.getData("text/plain")); if (r) move(r, col); }}>
            <header className="flex items-center gap-2 px-3 py-2">
              <h3 className="truncate text-label text-fg">{col === BLANK ? COPY.COMMON.BLANK : col}</h3>
              <Badge size="count">{items.length}</Badge>
              {total !== null && <span className="ml-auto text-caption text-fg-muted">{formatMoneyShort(total)}</span>}
            </header>
            <div className="flex min-h-24 flex-col gap-2 px-2 pb-2">
              {items.map((r) => (
                <Card key={r.id} padding="sm" draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", r.id)}
                  className={`cursor-grab ${moving === r.id ? "opacity-60" : ""}`}>
                  <div className="flex items-start gap-1">
                    <TextLink as={Link} to={`/r/${meta.name}/${r.id}`} className="min-w-0 flex-1 truncate text-label">{r.name || r.id}</TextLink>
                    <Menu label={COPY.RECORD.PATH} align="end"
                      trigger={<IconButton icon={MoveRight} label={`${COPY.LIST.KANBAN_GROUP} ${r.name ?? ""}`} variant="ghost" size="xs" />}
                      items={field.picklist.filter((v) => v !== r[groupField]).map((v) => ({ label: v, onSelect: () => move(r, v) }))} />
                  </div>
                  <dl className="mt-1 flex flex-col gap-0.5 text-caption text-fg-muted">
                    {cardFields.map((f) => (
                      <div key={f.name} className="flex gap-1 truncate"><dt className="sr-only">{f.label}</dt><dd className="truncate"><FieldValue field={f} record={r} /></dd></div>
                    ))}
                  </dl>
                </Card>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
