import { Link } from "react-router-dom";
import { Checkbox, TextLink } from "@kasumi/ui";
import { COPY } from "@/copy.js";
import { displayType, fieldValueOf, formatPlain } from "@/format.js";
import { useObjectForId } from "@/records/objectsByPrefix.js";

export default function FieldValue({ field, record }) {
  const objectFor = useObjectForId();
  const value = fieldValueOf(record, field);
  const type = displayType(field);
  if (type === "checkbox") return <Checkbox checked={Boolean(value)} disabled readOnly aria-label={field.label} />;
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && !value.length)) {
    return <span className="text-fg-muted">{COPY.COMMON.BLANK}</span>;
  }
  if (type === "lookup") {
    const target = objectFor(value);
    const label = record.$names?.[field.name] ?? value;
    return target ? <TextLink as={Link} to={`/r/${target.name}/${value}`}>{label}</TextLink> : <span>{label}</span>;
  }
  if (type === "email") return <TextLink href={`mailto:${value}`}>{value}</TextLink>;
  if (type === "url") {
    const href = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    return <TextLink href={href} target="_blank" rel="noopener noreferrer">{value}</TextLink>;
  }
  if (type === "textarea") return <span className="whitespace-pre-wrap">{value}</span>;
  return <span>{formatPlain(field, value, record.$names, record.currency_iso_code)}</span>;
}
