import { useEffect, useState } from "react";
import { Alert, Button, Card, CardContent, Checkbox, IconButton, Input, Select, useNotifications } from "@kasumi/ui";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { api } from "@/api.js";
import { COPY } from "@/copy.js";

const MAX_HIGHLIGHTS = 4;

export default function LayoutEditor({ meta, onSaved }) {
  const { notify } = useNotifications();
  const [sections, setSections] = useState([]);
  const [highlights, setHighlights] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setSections(meta.layout.sections.map((s) => ({ ...s, fields: [...s.fields] })));
    setHighlights([...meta.layout.highlights]);
  }, [meta]);

  const fields = meta.fields.filter((f) => !f.system);
  const label = (name) => fields.find((f) => f.name === name)?.label ?? name;
  const placed = new Set(sections.flatMap((s) => s.fields));
  const unplaced = fields.filter((f) => !placed.has(f.name));

  const update = (i, patch) => setSections(sections.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const moveField = (si, fi, d) => {
    const list = [...sections[si].fields];
    [list[fi], list[fi + d]] = [list[fi + d], list[fi]];
    update(si, { fields: list });
  };
  const moveToSection = (si, fi, target) => {
    const name = sections[si].fields[fi];
    setSections(sections.map((s, j) => {
      if (j === si) return { ...s, fields: s.fields.filter((_, k) => k !== fi) };
      if (j === target) return { ...s, fields: [...s.fields, name] };
      return s;
    }));
  };
  const save = () => {
    setBusy(true);
    setError(null);
    api(`/meta/objects/${meta.name}/layout`, { method: "PUT", body: { sections, related: meta.layout.related, highlights } }).then(
      () => { setBusy(false); notify(COPY.SETUP.LAYOUT_SAVED, "success"); onSaved(); },
      (err) => { setBusy(false); setError(err.message); },
    );
  };

  return (
    <div className="flex flex-col gap-4 pt-4">
      {error && <Alert tone="error">{error}</Alert>}
      <Card><CardContent>
        <h3 className="mb-2 text-label text-fg">{COPY.SETUP.HIGHLIGHTS}</h3>
        <div className="grid gap-1 sm:grid-cols-3">
          {fields.map((f) => (
            <Checkbox key={f.name} label={f.label} checked={highlights.includes(f.name)}
              disabled={!highlights.includes(f.name) && highlights.length >= MAX_HIGHLIGHTS}
              onChange={(e) => setHighlights(e.target.checked ? [...highlights, f.name] : highlights.filter((h) => h !== f.name))} />
          ))}
        </div>
      </CardContent></Card>
      {sections.map((s, si) => (
        <Card key={si}><CardContent className="flex flex-col gap-2">
          <div className="flex items-end gap-2">
            <div className="flex-1"><Input label={COPY.SETUP.SECTION_NAME} value={s.label} onChange={(e) => update(si, { label: e.target.value })} /></div>
            <IconButton icon={X} label={COPY.COMMON.REMOVE} variant="ghost" size="sm" onClick={() => setSections(sections.filter((_, j) => j !== si))} />
          </div>
          <ul className="flex flex-col gap-1">
            {s.fields.map((name, fi) => (
              <li key={name} className="flex flex-wrap items-center gap-2 rounded-control border border-line-muted px-2 py-1">
                <span className="flex-1 text-body text-fg">{label(name)}</span>
                <IconButton icon={ArrowUp} label={COPY.SETUP.MOVE_UP} variant="ghost" size="xs" disabled={fi === 0} onClick={() => moveField(si, fi, -1)} />
                <IconButton icon={ArrowDown} label={COPY.SETUP.MOVE_DOWN} variant="ghost" size="xs" disabled={fi === s.fields.length - 1} onClick={() => moveField(si, fi, 1)} />
                {sections.length > 1 && (
                  <Select fieldSize="sm" aria-label={COPY.SETUP.MOVE_TO} value={si} onChange={(e) => moveToSection(si, fi, Number(e.target.value))}>
                    {sections.map((t, ti) => <option key={ti} value={ti}>{t.label}</option>)}
                  </Select>
                )}
                <IconButton icon={X} label={COPY.COMMON.REMOVE} variant="ghost" size="xs" onClick={() => update(si, { fields: s.fields.filter((_, k) => k !== fi) })} />
              </li>
            ))}
          </ul>
        </CardContent></Card>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => setSections([...sections, { label: COPY.SETUP.SECTION, fields: [] }])}>
          <Plus aria-hidden="true" className="h-4 w-4" />{COPY.SETUP.ADD_SECTION}
        </Button>
        <Button className="ml-auto" onClick={save} loading={busy}>{COPY.COMMON.SAVE}</Button>
      </div>
      {unplaced.length > 0 && sections.length > 0 && (
        <Card><CardContent>
          <h3 className="mb-2 text-label text-fg">{COPY.SETUP.UNPLACED}</h3>
          <div className="flex flex-wrap gap-2">
            {unplaced.map((f) => (
              <Button key={f.name} size="xs" variant="secondary" onClick={() => update(0, { fields: [...sections[0].fields, f.name] })}>
                <Plus aria-hidden="true" className="h-3.5 w-3.5" />{f.label}
              </Button>
            ))}
          </div>
        </CardContent></Card>
      )}
    </div>
  );
}
