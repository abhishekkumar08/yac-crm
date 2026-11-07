import { useEffect, useId, useRef, useState } from "react";
import { Button, Chip, Input, Popover, Spinner } from "@kasumi/ui";
import { Search } from "lucide-react";
import { api, qs } from "@/api.js";
import { COPY } from "@/copy.js";

export default function LookupInput({ field, value, name, onChange, error, label, required }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    clearTimeout(timer.current);
    let live = true;
    timer.current = setTimeout(() => {
      setLoading(true);
      api(`/lookup${qs({ objects: field.referenceTo, q: query })}`).then(
        (rows) => { if (live) { setResults(rows); setLoading(false); } },
        () => { if (live) { setResults([]); setLoading(false); } },
      );
    }, 200);
    return () => { live = false; clearTimeout(timer.current); };
  }, [query, open, field.referenceTo]);

  if (value) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-label text-fg">{label}</span>
        <div><Chip onRemove={() => onChange(null, null)} removeLabel={COPY.RECORD.LOOKUP_CLEAR(field.label)}>{name ?? value}</Chip></div>
        {error && <span className="text-caption text-error-fg">{error}</span>}
      </div>
    );
  }

  const trigger = (
    <Input id={id} label={label} required={required} error={error} value={query} autoComplete="off"
      placeholder={COPY.RECORD.LOOKUP_SEARCH(field.label)} leading={<Search aria-hidden="true" className="h-4 w-4" />}
      onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
  );

  return (
    <Popover trigger={trigger} open={open} onOpenChange={setOpen} toggleOnClick={false} popupRole="listbox"
      label={field.label} align="start" panelClassName="w-80 max-h-72 overflow-y-auto p-1">
      {loading && <div className="flex justify-center p-3"><Spinner size="sm" /></div>}
      {!loading && results.length === 0 && <p className="p-3 text-caption text-fg-muted">{COPY.RECORD.LOOKUP_EMPTY}</p>}
      {!loading && results.map((r) => (
        <Button key={r.id} variant="ghost" size="sm" className="w-full justify-start"
          onClick={() => { onChange(r.id, r.name); setQuery(""); setOpen(false); }}>
          <span className="truncate">{r.name}</span>
          <span className="ml-auto text-caption text-fg-muted">{r.label}</span>
        </Button>
      ))}
    </Popover>
  );
}
