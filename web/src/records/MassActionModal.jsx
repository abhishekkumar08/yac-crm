import { useEffect, useState } from "react";
import { Button, Modal, Select } from "@kasumi/ui";
import { COPY } from "@/copy.js";
import LookupInput from "@/records/LookupInput.jsx";

const CAMPAIGN_FIELD = { name: "campaign", label: COPY.LIST.CAMPAIGN, referenceTo: "campaign", type: "lookup" };

export default function MassActionModal({ meta, kind, open, busy, onClose, onConfirm }) {
  const statusField = meta.fields.find((f) => f.name === "status");
  const [status, setStatus] = useState("");
  const [campaign, setCampaign] = useState({ id: null, name: null });
  useEffect(() => { if (open) { setStatus(statusField?.picklist?.[0] ?? ""); setCampaign({ id: null, name: null }); } }, [open, statusField]);
  const body = kind === "status" ? { action: "set", values: { status } } : { action: "add_to_campaign", campaignId: campaign.id };
  const ready = kind === "status" ? Boolean(status) : Boolean(campaign.id);
  return (
    <Modal open={open} onClose={onClose} size="sm" title={kind === "status" ? COPY.LIST.MASS_STATUS : COPY.LIST.MASS_CAMPAIGN}
      footer={<div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>{COPY.COMMON.CANCEL}</Button>
        <Button onClick={() => onConfirm(body)} loading={busy} disabled={!ready}>{COPY.COMMON.SAVE}</Button>
      </div>}>
      {kind === "status" && statusField && (
        <Select label={statusField.label} value={status} onChange={(e) => setStatus(e.target.value)}>
          {statusField.picklist.map((v) => <option key={v} value={v}>{v}</option>)}
        </Select>
      )}
      {kind === "campaign" && (
        <LookupInput field={CAMPAIGN_FIELD} label={CAMPAIGN_FIELD.label} value={campaign.id} name={campaign.name}
          onChange={(id, name) => setCampaign({ id, name })} />
      )}
    </Modal>
  );
}
