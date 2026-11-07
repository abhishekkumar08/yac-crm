import { Link } from "react-router-dom";
import { Card, CardContent, CardTitle, PageHeader, StatCard, TextLink } from "@kasumi/ui";
import { Boxes, GitBranch, Shield, Users, Workflow } from "lucide-react";
import { COPY } from "@/copy.js";
import { useSession } from "@/hooks.js";

const LINKS = [
  ["/setup/objects", COPY.SETUP.OBJECT_MANAGER, COPY.SETUP.OBJECTS_SUBTITLE, Boxes],
  ["/setup/users", COPY.SETUP.USERS, COPY.SETUP.USERS_SUBTITLE, Users],
  ["/setup/roles", COPY.SETUP.ROLES, COPY.SETUP.ROLES_SUBTITLE, GitBranch],
  ["/setup/sharing", COPY.SETUP.SHARING, COPY.SETUP.SHARING_SUBTITLE, Shield],
  ["/setup/automation", COPY.SETUP.AUTOMATION, COPY.SETUP.AUTOMATION_SUBTITLE, Workflow],
];

export default function SetupHome() {
  const { objects } = useSession();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={COPY.SETUP.HOME} />
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard label={COPY.SETUP.OBJECT_MANAGER} value={objects.length} icon={Boxes} />
        <StatCard label={COPY.SETUP.CUSTOM} value={objects.filter((o) => o.custom).length} icon={Boxes} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {LINKS.map(([to, title, text, Icon]) => (
          <Card key={to}><CardContent>
            <CardTitle as="h2" icon={Icon}><TextLink as={Link} to={to}>{title}</TextLink></CardTitle>
            <p className="mt-1 text-body text-fg-muted">{text}</p>
          </CardContent></Card>
        ))}
      </div>
    </div>
  );
}
