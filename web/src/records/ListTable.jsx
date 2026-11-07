import { Link } from "react-router-dom";
import { Checkbox, Menu, Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, TextLink, IconButton } from "@kasumi/ui";
import { MoreVertical } from "lucide-react";
import { COPY } from "@/copy.js";
import { displayType } from "@/format.js";
import InlineCell from "@/records/InlineCell.jsx";

import { NUMERIC_TYPES as NUMERIC } from "@shared/field-types.js";

export default function ListTable({ meta, records, columns, sort, onSort, selected, onSelect, onRowSaved, onEdit, onDelete, onOwner }) {
  const byName = new Map(meta.fields.map((f) => [f.name, f]));
  const cols = columns.map((c) => byName.get(c)).filter(Boolean);
  const allSelected = records.length > 0 && records.every((r) => selected.has(r.id));
  const toggleAll = () => onSelect(allSelected ? new Set() : new Set(records.map((r) => r.id)));
  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onSelect(next);
  };
  return (
    <Table containerClassName="rounded-card border border-line">
      <TableHead>
        <TableRow>
          <TableHeader className="w-10"><Checkbox aria-label={COPY.LIST.SELECT_ALL} checked={allSelected} onChange={toggleAll} /></TableHeader>
          {cols.map((f) => (
            <TableHeader key={f.name} numeric={NUMERIC.has(displayType(f))}
              sortDirection={sort?.field === f.name ? sort.dir : undefined}
              onSort={() => onSort({ field: f.name, dir: sort?.field === f.name && sort.dir === "asc" ? "desc" : "asc" })}>
              {f.label}
            </TableHeader>
          ))}
          <TableHeader className="w-12"><span className="sr-only">{COPY.COMMON.EDIT}</span></TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {records.length === 0 && <TableEmpty colSpan={cols.length + 2}>{COPY.LIST.EMPTY_TITLE(meta.plural)}</TableEmpty>}
        {records.map((r) => (
          <TableRow key={r.id}>
            <TableCell><Checkbox aria-label={COPY.LIST.SELECT_ROW(r.name ?? r.id)} checked={selected.has(r.id)} onChange={() => toggle(r.id)} /></TableCell>
            {cols.map((f, i) => (
              <TableCell key={f.name} numeric={NUMERIC.has(displayType(f))} className="max-w-72">
                {i === 0
                  ? <TextLink as={Link} to={`/r/${meta.name}/${r.id}`}>{r.name || r.id}</TextLink>
                  : <InlineCell meta={meta} field={f} record={r} onSaved={onRowSaved} />}
              </TableCell>
            ))}
            <TableCell>
              <Menu label={COPY.COMMON.EDIT} align="end" trigger={<IconButton icon={MoreVertical} label={`${COPY.COMMON.EDIT} ${r.name ?? ""}`} variant="ghost" size="xs" />}
                items={[
                  { label: COPY.COMMON.EDIT, onSelect: () => onEdit(r) },
                  { label: COPY.COMMON.CHANGE_OWNER, onSelect: () => onOwner(r) },
                  { label: COPY.COMMON.DELETE, tone: "danger", onSelect: () => onDelete(r) },
                ]} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
