import { useState } from "react";
import { EmptyState, ErrorState, LoadingCard, PageHeader, SegmentedControl } from "@kasumi/ui";
import { MessagesSquare } from "lucide-react";
import { COPY } from "@/copy.js";
import { useApi } from "@/hooks.js";
import FeedItem from "@/feed/FeedItem.jsx";

export default function Chatter() {
  const [scope, setScope] = useState("following");
  const { data, error, loading, reload } = useApi(`/feed?scope=${scope}`);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader title={COPY.FEED.TITLE}>
        <SegmentedControl label={COPY.FEED.SHOW} value={scope} onChange={setScope}
          options={Object.entries(COPY.FEED.SCOPES).map(([value, label]) => ({ value, label }))} />
      </PageHeader>
      {error && <ErrorState message={error.message} onRetry={reload} retryLabel={COPY.COMMON.RETRY} />}
      {loading && !data && <LoadingCard />}
      {data && data.length === 0 && <EmptyState icon={MessagesSquare} title={COPY.FEED.EMPTY} />}
      {data?.map((item) => <FeedItem key={item.id} item={item} showRecord onChanged={reload} />)}
    </div>
  );
}
