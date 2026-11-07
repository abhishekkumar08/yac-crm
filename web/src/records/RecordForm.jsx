import { Alert } from "@kasumi/ui";
import FieldInput, { isEditable } from "@/records/FieldInput.jsx";

export default function RecordForm({ meta, values, names, errors, onChange, record }) {
  const byName = new Map(meta.fields.map((f) => [f.name, f]));
  const general = errors._record ?? errors.owner;
  return (
    <div className="flex flex-col gap-6">
      {general && <Alert tone="error">{general}</Alert>}
      {meta.layout.sections.map((section) => {
        const fields = section.fields.map((n) => byName.get(n))
          .filter((f) => f && !f.system && (record || isEditable(f)));
        if (!fields.length) return null;
        return (
          <section key={section.label} aria-label={section.label}>
            <h3 className="mb-3 rounded-control bg-surface-subtle px-3 py-1.5 text-label text-fg">{section.label}</h3>
            <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
              {fields.map((f) => (
                <div key={f.name} className={f.type === "textarea" ? "md:col-span-2" : undefined}>
                  <FieldInput field={f} value={values[f.name]} names={names} error={errors[f.name]}
                    onChange={onChange} record={record} />
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
