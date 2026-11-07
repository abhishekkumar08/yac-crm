import { useState } from "react";
import { Link } from "react-router-dom";
import { Avatar, Button, Card, CardContent, IconButton, TextLink, useNotifications } from "@kasumi/ui";
import { Heart, MessageSquare, Trash2 } from "lucide-react";
import { api } from "@/api.js";
import { COPY } from "@/copy.js";
import { useSession } from "@/hooks.js";
import { formatDateTime } from "@/format.js";
import MentionInput, { toTokens } from "@/feed/MentionInput.jsx";

const MENTION = /@\[([^\]]+)\]\(([^)\s]{1,40})\)/g;

export function RichText({ text }) {
  const parts = [];
  let last = 0;
  for (const m of String(text ?? "").matchAll(MENTION)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(<span key={m.index} className="rounded-control bg-accent-subtle px-1 text-label text-fg">@{m[1]}</span>);
    last = m.index + m[0].length;
  }
  parts.push(String(text ?? "").slice(last));
  return <p className="whitespace-pre-wrap text-body text-fg">{parts}</p>;
}

export default function FeedItem({ item, showRecord, onChanged }) {
  const { notify } = useNotifications();
  const { user, isAdmin } = useSession();
  const [commenting, setCommenting] = useState(false);
  const [text, setText] = useState("");
  const [mentions, setMentions] = useState([]);
  const [busy, setBusy] = useState(false);

  const like = () => api(`/feed/${item.id}/like`, { method: "POST" }).then(onChanged, (err) => notify(err.message, "error"));
  const remove = () => api(`/feed/${item.id}`, { method: "DELETE" }).then(() => { notify(COPY.FEED.DELETED, "success"); onChanged(); }, (err) => notify(err.message, "error"));
  const sendComment = () => {
    setBusy(true);
    api(`/feed/${item.id}/comments`, { method: "POST", body: { body: toTokens(text, mentions) } }).then(
      () => { setBusy(false); setText(""); setMentions([]); setCommenting(false); onChanged(); },
      (err) => { setBusy(false); notify(err.message, "error"); },
    );
  };

  return (
    <Card padding="sm">
      <CardContent className="flex flex-col gap-2 p-0">
        <div className="flex items-start gap-2">
          <Avatar name={item.authorName ?? ""} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="text-label text-fg">
              {item.authorName}
              {showRecord && item.recordName && <span className="text-fg-muted"> {COPY.FEED.ON("")}<TextLink as={Link} to={`/r/${item.object}/${item.recordId}`}>{item.recordName}</TextLink></span>}
            </p>
            <p className="text-caption text-fg-muted">{formatDateTime(item.createdAt)}</p>
          </div>
          {(item.authorId === user.id || isAdmin) && item.type === "post" && (
            <IconButton icon={Trash2} label={COPY.FEED.DELETE} variant="ghost" size="xs" onClick={remove} />
          )}
        </div>
        {item.type === "post" && <RichText text={item.body} />}
        {item.type === "tracked" && (
          <ul className="text-body text-fg">
            {item.changes.map((c) => <li key={c.field}>{COPY.FEED.CHANGED(c.label, c.from, c.to)}</li>)}
          </ul>
        )}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="xs" onClick={like} aria-pressed={item.likedByMe}>
            <Heart aria-hidden="true" className={`h-3.5 w-3.5 ${item.likedByMe ? "fill-current" : ""}`} />
            {item.likedByMe ? COPY.FEED.UNLIKE : COPY.FEED.LIKE}
          </Button>
          <Button variant="ghost" size="xs" onClick={() => setCommenting((c) => !c)}>
            <MessageSquare aria-hidden="true" className="h-3.5 w-3.5" />{COPY.FEED.COMMENT}
          </Button>
          {item.likes > 0 && <span className="text-caption text-fg-muted">{COPY.FEED.LIKES(item.likes)}</span>}
        </div>
        {item.comments.length > 0 && (
          <ul className="flex flex-col gap-2 border-l-2 border-line pl-3">
            {item.comments.map((c) => (
              <li key={c.id}>
                <p className="text-caption text-fg-muted">{c.authorName} · {formatDateTime(c.createdAt)}</p>
                <RichText text={c.body} />
              </li>
            ))}
          </ul>
        )}
        {commenting && (
          <div className="flex flex-col gap-2">
            <MentionInput label={COPY.FEED.COMMENT} value={text} onChange={setText} mentions={mentions} onMentionsChange={setMentions}
              placeholder={COPY.FEED.COMMENT_PLACEHOLDER} rows={2} />
            <div className="flex justify-end"><Button size="sm" onClick={sendComment} loading={busy} disabled={!text.trim()}>{COPY.FEED.COMMENT}</Button></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
