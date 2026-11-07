import { useNavigate } from "react-router-dom";
import { Button, Card, Modal, SectionHeader } from "@kasumi/ui";
import { useSession } from "@/hooks.js";
import { COPY } from "@/copy.js";
import { objectIcon } from "@/icons.js";

export default function AppLauncher({ open, onClose }) {
  const { apps, objects, app, setApp } = useSession();
  const navigate = useNavigate();
  const go = (to) => { onClose(); navigate(to); };

  return (
    <Modal open={open} onClose={onClose} title={COPY.SHELL.APP_LAUNCHER} size="xl">
      <SectionHeader title={COPY.SHELL.APPS} as="h3" />
      <div className="mb-6 mt-3 grid gap-3 sm:grid-cols-2">
        {apps.map((a) => (
          <Card key={a.name} as="button" type="button" interactive selected={a.name === app?.name} padding="sm"
            className="text-left" onClick={() => { setApp(a.name); go("/"); }}>
            <p className="text-label text-fg">{a.label}</p>
            <p className="text-caption text-fg-muted">{a.description}</p>
          </Card>
        ))}
      </div>
      <SectionHeader title={COPY.SHELL.ALL_ITEMS} as="h3" />
      <ul className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-3">
        {objects.map((o) => {
          const Icon = objectIcon(o.icon);
          return (
            <li key={o.name}>
              <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => go(`/o/${o.name}`)}>
                <Icon aria-hidden="true" className="h-4 w-4 text-fg-muted" />
                {o.plural}
              </Button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
