import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Checkbox, Fieldset, Input, List, ListRow, Modal, RadioGroup, Select, TextLink, useNotifications } from "@kasumi/ui";
import { api, qs } from "@/api.js";
import { COPY } from "@/copy.js";
import { useObjectMeta } from "@/hooks.js";
import LookupInput from "@/records/LookupInput.jsx";

const lookupField = (name, label) => ({ name, label, referenceTo: name, type: "lookup" });
const ACCOUNT_FIELD = lookupField("account", COPY.CONVERT.ACCOUNT);
const CONTACT_FIELD = lookupField("contact", COPY.CONVERT.CONTACT);
const OPPORTUNITY_FIELD = lookupField("opportunity", COPY.CONVERT.OPPORTUNITY);
const EMPTY = { id: null, name: null };
const isConverted = (v) => /\bConverted\b/.test(v) && !/\bNot Converted\b/.test(v);

function Choice({ name, mode, setMode, newLabel, existingLabel, field, picked, setPicked, children }) {
  return (
    <>
      <RadioGroup name={name} orientation="horizontal" value={mode} onChange={setMode}
        options={[{ value: "new", label: newLabel }, { value: "existing", label: existingLabel }]} />
      <div className="mt-3">
        {mode === "new" ? children
          : <LookupInput field={field} label={field.label} value={picked.id} name={picked.name} onChange={(id, n) => setPicked({ id, name: n })} />}
      </div>
    </>
  );
}

export default function ConvertLeadModal({ lead, open, onClose }) {
  const { notify } = useNotifications();
  const { meta: leadMeta } = useObjectMeta("lead");
  const statuses = (leadMeta?.fields.find((f) => f.name === "status")?.picklist ?? []).filter(isConverted);
  const [accountMode, setAccountMode] = useState("new");
  const [contactMode, setContactMode] = useState("new");
  const [oppMode, setOppMode] = useState("new");
  const [accountName, setAccountName] = useState("");
  const [account, setAccount] = useState(EMPTY);
  const [contact, setContact] = useState(EMPTY);
  const [opportunity, setOpportunity] = useState(EMPTY);
  const [matches, setMatches] = useState([]);
  const [oppName, setOppName] = useState("");
  const [noOpp, setNoOpp] = useState(false);
  const [status, setStatus] = useState("");
  const [users, setUsers] = useState([]);
  const [ownerId, setOwnerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!open) return;
    setAccountMode("new"); setContactMode("new"); setOppMode("new");
    setAccountName(lead.company ?? ""); setAccount(EMPTY); setContact(EMPTY); setOpportunity(EMPTY);
    setOppName(`${lead.company ?? lead.name}-`); setNoOpp(false); setStatus(""); setOwnerId(lead.ownerId);
    setError(null); setResult(null);
    api("/users").then(setUsers, (err) => notify(err.message, "error"));
    api(`/lookup${qs({ objects: "account", q: lead.company ?? "" })}`).then(setMatches, () => setMatches([]));
  }, [open, lead, notify]);

  const chosenStatus = status || statuses[0] || "";
  const ready = (accountMode === "existing" ? account.id : accountName.trim())
    && (contactMode === "new" || contact.id) && (oppMode === "new" || noOpp || opportunity.id) && chosenStatus;

  const convert = () => {
    setBusy(true);
    setError(null);
    const body = {
      ownerId, convertedStatus: chosenStatus,
      ...(accountMode === "existing" ? { accountId: account.id } : { accountName }),
      ...(contactMode === "existing" ? { contactId: contact.id } : {}),
      ...(noOpp ? { createOpportunity: false } : oppMode === "existing" ? { opportunityId: opportunity.id } : { opportunityName: oppName }),
    };
    api(`/leads/${lead.id}/convert`, { method: "POST", body }).then(
      (res) => { setBusy(false); setResult(res); notify(COPY.CONVERT.DONE, "success"); },
      (err) => { setBusy(false); setError(err.fields ? Object.values(err.fields).join(" ") : err.message); },
    );
  };

  const close = () => onClose(Boolean(result));
  const footer = result
    ? <div className="flex justify-end"><Button onClick={close}>{COPY.COMMON.CLOSE}</Button></div>
    : (
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => onClose(false)} disabled={busy}>{COPY.COMMON.CANCEL}</Button>
        <Button onClick={convert} loading={busy} disabled={!ready}>{COPY.CONVERT.SUBMIT}</Button>
      </div>
    );

  return (
    <Modal open={open} onClose={busy ? undefined : close} title={COPY.CONVERT.TITLE} size="lg" footer={footer}>
      {result ? (
        <div className="flex flex-col gap-3">
          <Alert tone="success">{COPY.CONVERT.DONE}</Alert>
          <List>
            <ListRow title={<TextLink as={Link} to={`/r/account/${result.accountId}`} onClick={close}>{COPY.CONVERT.ACCOUNT}</TextLink>} />
            <ListRow title={<TextLink as={Link} to={`/r/contact/${result.contactId}`} onClick={close}>{COPY.CONVERT.CONTACT}</TextLink>} />
            {result.opportunityId && <ListRow title={<TextLink as={Link} to={`/r/opportunity/${result.opportunityId}`} onClick={close}>{COPY.CONVERT.OPPORTUNITY}</TextLink>} />}
          </List>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {error && <Alert tone="error">{error}</Alert>}
          <Fieldset legend={COPY.CONVERT.ACCOUNT} variant="card"
            description={accountMode === "new" && matches.length ? COPY.CONVERT.MATCHES(matches.length) : undefined}>
            <Choice name="account-mode" mode={accountMode} setMode={setAccountMode} newLabel={COPY.CONVERT.NEW_ACCOUNT}
              existingLabel={COPY.CONVERT.EXISTING_ACCOUNT} field={ACCOUNT_FIELD} picked={account} setPicked={setAccount}>
              <Input label={COPY.CONVERT.ACCOUNT_NAME} value={accountName} onChange={(e) => setAccountName(e.target.value)} required />
            </Choice>
            {accountMode === "new" && matches.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {matches.slice(0, 5).map((m) => (
                  <Button key={m.id} size="xs" variant="secondary" onClick={() => { setAccountMode("existing"); setAccount({ id: m.id, name: m.name }); }}>{m.name}</Button>
                ))}
              </div>
            )}
          </Fieldset>
          <Fieldset legend={COPY.CONVERT.CONTACT} variant="card">
            <Choice name="contact-mode" mode={contactMode} setMode={setContactMode} newLabel={COPY.CONVERT.NEW_CONTACT}
              existingLabel={COPY.CONVERT.EXISTING_CONTACT} field={CONTACT_FIELD} picked={contact} setPicked={setContact}>
              <p className="text-caption text-fg-muted">{COPY.CONVERT.CONTACT_HINT(lead.name)}</p>
            </Choice>
          </Fieldset>
          <Fieldset legend={COPY.CONVERT.OPPORTUNITY} variant="card">
            <Choice name="opp-mode" mode={oppMode} setMode={setOppMode} newLabel={COPY.CONVERT.NEW_OPPORTUNITY}
              existingLabel={COPY.CONVERT.EXISTING_OPPORTUNITY} field={OPPORTUNITY_FIELD} picked={opportunity} setPicked={setOpportunity}>
              <Input label={COPY.CONVERT.OPP_NAME} value={oppName} onChange={(e) => setOppName(e.target.value)} disabled={noOpp} />
            </Choice>
            <div className="mt-2"><Checkbox label={COPY.CONVERT.NO_OPP} checked={noOpp} onChange={(e) => setNoOpp(e.target.checked)} /></div>
          </Fieldset>
          <div className="grid gap-4 md:grid-cols-2">
            <Select label={COPY.CONVERT.STATUS} value={chosenStatus} onChange={(e) => setStatus(e.target.value)}>
              {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
            <Select label={COPY.CONVERT.OWNER} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </div>
        </div>
      )}
    </Modal>
  );
}
