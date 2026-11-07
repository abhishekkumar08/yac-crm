import { useState } from "react";
import { Button, ErrorState, LoadingCard, useNotifications } from "@kasumi/ui";
import { api } from "@/api.js";
import { COPY } from "@/copy.js";
import { useApi } from "@/hooks.js";
import FeedItem from "@/feed/FeedItem.jsx";
import MentionInput, { toTokens } from "@/feed/MentionInput.jsx";

export default function FeedPanel({ object, recordId, version, onPosted }) {
  const { notify } = useNotifications();
  const { data, error, loading, reload } = useApi(`/records/${object}/${recordId}/feed?v=${version}`);
  const [text, setText] = useState("");
  const [mentions, setMentions] = useState([]);
  const [busy, setBusy] = useState(false);
  const share = () => {
    setBusy(true);
    api(`/records/${object}/${recordId}/feed`, { method: "POST", body: { body: toTokens(text, mentions) } }).then(
      () => { setBusy(false); setText(""); setMentions([]); onPosted?.(); },
      (err) => { setBusy(false); notify(err.message, "error"); },
    );
  };
  return (
    <div className="flex flex-col gap-3 pt-4">
      <MentionInput label={COPY.FEED.TITLE} value={text} onChange={setText} mentions={mentions} onMentionsChange={setMentions}
        placeholder={COPY.FEED.PLACEHOLDER} rows={3} />
      <div className="flex justify-end"><Button size="sm" onClick={share} loading={busy} disabled={!text.trim()}>{COPY.FEED.SHARE}</Button></div>
      {error && <ErrorState message={error.message} onRetry={reload} retryLabel={COPY.COMMON.RETRY} />}
      {loading && !data && <LoadingCard />}
      {data && data.items.length === 0 && <p className="text-body text-fg-muted">{COPY.FEED.EMPTY}</p>}
      {data?.items.map((item) => <FeedItem key={item.id} item={item} onChanged={reload} />)}
    </div>
  );
}
