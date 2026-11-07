import { ErrorState, List, ListRow, LoadingCard } from "@kasumi/ui";
import { COPY } from "@/copy.js";
import { useApi } from "@/hooks.js";
import { formatDateTime } from "@/format.js";

export default function HistoryList({ object, id, version }) {
  const { data, error, loading, reload } = useApi(`/records/${object}/${id}/history?v=${version}`);
  if (error) return <ErrorState message={error.message} onRetry={reload} retryLabel={COPY.COMMON.RETRY} />;
  if (loading && !data) return <LoadingCard />;
  if (!data.length) return <p className="text-body text-fg-muted">{COPY.RECORD.HISTORY_EMPTY}</p>;
  return (
    <List>
      {data.map((h) => (
        <ListRow key={h.id}
          title={h.field === "created" ? COPY.RECORD.HISTORY_CREATED
            : COPY.RECORD.HISTORY_CHANGED(h.fieldLabel, h.oldName ?? h.oldValue, h.newName ?? h.newValue)}
          meta={`${h.userName ?? ""} · ${formatDateTime(h.at)}`} />
      ))}
    </List>
  );
}
