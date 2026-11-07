import { useEffect, useRef, useState } from "react";
import { Button, Textarea } from "@kasumi/ui";
import { api } from "@/api.js";
import { COPY } from "@/copy.js";

let usersCache = null;
const loadUsers = () => (usersCache ??= api("/users").catch(() => { usersCache = null; return []; }));

export function toTokens(text, mentions) {
  return mentions.reduce((out, m) => out.split(`@${m.name}`).join(`@[${m.name}](${m.id})`), text);
}

export default function MentionInput({ value, onChange, mentions, onMentionsChange, placeholder, label, rows = 2 }) {
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState(null);
  const ref = useRef(null);
  useEffect(() => { loadUsers().then(setUsers); }, []);
  useEffect(() => { if (!value) setQuery(null); }, [value]);

  const onText = (e) => {
    const text = e.target.value;
    onChange(text);
    const upto = text.slice(0, e.target.selectionStart);
    const m = upto.match(/@([\w.'-]{0,30})$/);
    setQuery(m ? m[1].toLowerCase() : null);
  };
  const pick = (u) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const start = value.slice(0, caret).lastIndexOf("@");
    const next = `${value.slice(0, start)}@${u.name} ${value.slice(caret)}`;
    onChange(next);
    if (!mentions.some((m) => m.id === u.id)) onMentionsChange([...mentions, { id: u.id, name: u.name }]);
    setQuery(null);
    el?.focus();
  };
  const matches = query === null ? [] : users.filter((u) => u.name.toLowerCase().includes(query)).slice(0, 6);

  return (
    <div className="relative">
      <Textarea ref={ref} aria-label={label} rows={rows} value={value} placeholder={placeholder} onChange={onText}
        onKeyDown={(e) => { if (e.key === "Escape") setQuery(null); }} />
      {query !== null && (
        <div role="listbox" aria-label={label} className="absolute z-dropdown mt-1 w-64 rounded-card border border-line bg-surface p-1 shadow-overlay">
          {matches.length === 0 && <p className="p-2 text-caption text-fg-muted">{COPY.FEED.MENTION_EMPTY}</p>}
          {matches.map((u) => (
            <Button key={u.id} role="option" variant="ghost" size="sm" className="w-full justify-start" onClick={() => pick(u)}>{u.name}</Button>
          ))}
        </div>
      )}
    </div>
  );
}
