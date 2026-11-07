import { useState } from "react";
import { Alert, Button, FileDropzone, Modal, useNotifications } from "@kasumi/ui";
import { api } from "@/api.js";
import { COPY } from "@/copy.js";

export default function ImportModal({ meta, open, onClose, onImported }) {
  const { notify } = useNotifications();
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const close = () => { setFile(null); setResult(null); onClose(); };
  const run = () => {
    setBusy(true);
    file.text().then(
      (csv) => api(`/import/${meta.name}`, { method: "POST", body: { csv } }),
      () => { throw new Error(COPY.IMPORT.READ_FAILED); },
    ).then(
      (res) => { setBusy(false); setResult(res); if (res.created) onImported(); },
      (err) => { setBusy(false); notify(err.message, "error"); },
    );
  };
  const footer = (
    <div className="flex justify-end gap-2">
      <Button variant="secondary" onClick={close}>{COPY.COMMON.CLOSE}</Button>
      {!result && <Button onClick={run} disabled={!file} loading={busy}>{COPY.IMPORT.START}</Button>}
    </div>
  );
  return (
    <Modal open={open} onClose={close} title={COPY.IMPORT.TITLE(meta.plural)} footer={footer}>
      {!result && (
        <FileDropzone accept=".csv,text/csv" title={file ? file.name : COPY.IMPORT.DROP} description={COPY.IMPORT.DROP_HINT}
          onFiles={(files) => setFile(files[0] ?? null)} />
      )}
      {result && (
        <div className="flex flex-col gap-3">
          <Alert tone={result.errors.length ? "warning" : "success"}>{COPY.IMPORT.RESULT(result.created)}</Alert>
          {result.skippedColumns.length > 0 && <p className="text-caption text-fg-muted">{COPY.IMPORT.SKIPPED(result.skippedColumns)}</p>}
          {result.errors.length > 0 && (
            <div>
              <p className="text-label text-fg">{COPY.IMPORT.ROW_ERRORS(result.errors.length)}</p>
              <ul className="mt-2 max-h-60 overflow-y-auto text-caption text-fg-muted">
                {result.errors.slice(0, 100).map((e) => (
                  <li key={e.row}>{COPY.IMPORT.ROW(e.row)}: {Object.entries(e.errors).map(([f, m]) => `${f} – ${m}`).join("; ")}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
