import { useState } from "react";
import { Badge, Card, CardContent, CardHeader, CardTitle, ErrorState, FileDropzone, IconButton, List, ListRow, LoadingCard, TextLink, useNotifications } from "@kasumi/ui";
import { FileText, Trash2 } from "lucide-react";
import { api } from "@/api.js";
import { COPY } from "@/copy.js";
import { useApi } from "@/hooks.js";
import { formatDate } from "@/format.js";

const toBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
  reader.onerror = () => reject(new Error(COPY.FILES.READ_FAILED(file.name)));
  reader.readAsDataURL(file);
});

export default function FilesCard({ object, recordId }) {
  const { notify } = useNotifications();
  const { data, error, loading, reload } = useApi(`/records/${object}/${recordId}/files`);
  const [busy, setBusy] = useState(false);

  const upload = async (list) => {
    setBusy(true);
    let done = 0;
    for (const file of list) {
      try {
        const data64 = await toBase64(file);
        await api(`/records/${object}/${recordId}/files`, { method: "POST", body: { name: file.name, type: file.type, data: data64 } });
        done++;
      } catch (err) {
        notify(err.message, "error");
      }
    }
    setBusy(false);
    if (done) notify(COPY.FILES.UPLOADED(done), "success");
    reload();
  };
  const remove = (f) => api(`/files/${f.id}`, { method: "DELETE" }).then(
    () => { notify(COPY.FILES.DELETED, "success"); reload(); },
    (err) => notify(err.message, "error"),
  );

  return (
    <Card padding="none">
      <CardHeader className="flex flex-row items-center gap-2 px-card pt-card">
        <CardTitle as="h3">{COPY.FILES.TITLE}</CardTitle>
        {data && <Badge size="count">{data.length}</Badge>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-card pb-card">
        {error && <ErrorState message={error.message} onRetry={reload} retryLabel={COPY.COMMON.RETRY} />}
        {loading && !data && <LoadingCard />}
        {data && data.length === 0 && <p className="text-body text-fg-muted">{COPY.FILES.EMPTY}</p>}
        {data && data.length > 0 && (
          <List>
            {data.map((f) => (
              <ListRow key={f.id} leading={<FileText aria-hidden="true" className="h-4 w-4 text-fg-muted" />}
                title={<TextLink href={`/api/files/${f.id}/download`}>{f.name}</TextLink>}
                meta={`${COPY.FILES.SIZE(f.size)} · ${f.ownerName ?? ""} · ${formatDate(f.createdAt)}`}
                trailing={<IconButton icon={Trash2} label={`${COPY.COMMON.DELETE} ${f.name}`} variant="ghost" size="xs" onClick={() => remove(f)} />} />
            ))}
          </List>
        )}
        <FileDropzone multiple title={busy ? COPY.COMMON.LOADING : COPY.FILES.UPLOAD} description={COPY.FILES.DROP_HINT}
          disabled={busy} onFiles={upload} />
      </CardContent>
    </Card>
  );
}
