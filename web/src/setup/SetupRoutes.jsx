import { Link, Route, Routes, useLocation } from "react-router-dom";
import { Button, EmptyState } from "@kasumi/ui";
import { Lock } from "lucide-react";
import { COPY } from "@/copy.js";
import { useSession } from "@/hooks.js";
import SetupHome from "@/setup/SetupHome.jsx";
import ObjectManager from "@/setup/ObjectManager.jsx";
import ObjectDetail from "@/setup/ObjectDetail.jsx";
import Users from "@/setup/Users.jsx";
import Roles from "@/setup/Roles.jsx";
import Sharing from "@/setup/Sharing.jsx";
import Automation from "@/setup/Automation.jsx";
import Currencies from "@/setup/Currencies.jsx";
import ApprovalProcesses from "@/setup/ApprovalProcesses.jsx";
import EmailTemplates from "@/setup/EmailTemplates.jsx";
import Deliverability from "@/setup/Deliverability.jsx";

const NAV = [
  ["/setup", COPY.SETUP.HOME], ["/setup/objects", COPY.SETUP.OBJECT_MANAGER], ["/setup/users", COPY.SETUP.USERS],
  ["/setup/roles", COPY.SETUP.ROLES], ["/setup/sharing", COPY.SETUP.SHARING], ["/setup/automation", COPY.SETUP.AUTOMATION],
  ["/setup/approvals", COPY.SETUP.APPROVALS],
  ["/setup/email-templates", COPY.SETUP.TEMPLATES], ["/setup/deliverability", COPY.SETUP.DELIVERABILITY],
  ["/setup/currencies", COPY.SETUP.CURRENCY.TITLE],
];

export default function SetupRoutes() {
  const { isAdmin } = useSession();
  const { pathname } = useLocation();
  if (!isAdmin) return <EmptyState icon={Lock} titleAs="h1" title={COPY.SETUP.ADMIN_ONLY} />;
  const active = (to) => (to === "/setup" ? pathname === "/setup" : pathname.startsWith(to));
  return (
    <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label={COPY.SETUP.TITLE} className="flex flex-row flex-wrap gap-1 lg:flex-col">
        {NAV.map(([to, label]) => (
          <Button key={to} as={Link} to={to} variant="ghost" size="sm" aria-current={active(to) ? "page" : undefined}
            className={`justify-start ${active(to) ? "bg-accent-subtle text-fg" : ""}`}>{label}</Button>
        ))}
      </nav>
      <div className="min-w-0">
        <Routes>
          <Route index element={<SetupHome />} />
          <Route path="objects" element={<ObjectManager />} />
          <Route path="objects/:name" element={<ObjectDetail />} />
          <Route path="users" element={<Users />} />
          <Route path="roles" element={<Roles />} />
          <Route path="sharing" element={<Sharing />} />
          <Route path="automation" element={<Automation />} />
          <Route path="currencies" element={<Currencies />} />
          <Route path="approvals" element={<ApprovalProcesses />} />
          <Route path="email-templates" element={<EmailTemplates />} />
          <Route path="deliverability" element={<Deliverability />} />
        </Routes>
      </div>
    </div>
  );
}
