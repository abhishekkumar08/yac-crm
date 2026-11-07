import { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Avatar, BottomBar, Button, CommandPalette, IconButton, Input, Menu, TopNav, useTheme, Tooltip } from "@kasumi/ui";
import { Grip, Home, LayoutGrid, LogOut, Mail, Moon, Search, Settings, Sun, Trash2 } from "lucide-react";
import { useSession } from "@/hooks.js";
import { COPY } from "@/copy.js";
import { BRAND } from "@/brand.js";
import AppLauncher from "@/shell/AppLauncher.jsx";
import NotificationBell from "@/shell/NotificationBell.jsx";
import { tabsFor, isActive } from "@/shell/tabs.js";
import { objectIcon } from "@/icons.js";

export default function Shell() {
  const session = useSession();
  const { app, objects, user, isAdmin, signOut } = session;
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const [launcher, setLauncher] = useState(false);
  const [palette, setPalette] = useState(false);
  const [query, setQuery] = useState(() => new URLSearchParams(search).get("q") ?? "");
  const tabs = useMemo(() => tabsFor(app, objects), [app, objects]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const commands = useMemo(() => [
    ...tabs.map((t) => ({ id: `tab:${t.key}`, label: t.label, group: app?.label, onSelect: () => navigate(t.to) })),
    ...objects.map((o) => ({ id: `obj:${o.name}`, label: o.plural, group: COPY.SHELL.ALL_ITEMS, keywords: [o.label], onSelect: () => navigate(`/o/${o.name}`) })),
    { id: "bin", label: COPY.SHELL.RECYCLE_BIN, group: COPY.SHELL.ALL_ITEMS, onSelect: () => navigate("/recycle-bin") },
    ...(isAdmin ? [{ id: "setup", label: COPY.SHELL.SETUP, group: COPY.SHELL.ALL_ITEMS, onSelect: () => navigate("/setup") }] : []),
  ], [tabs, objects, app, isAdmin, navigate]);

  const submitSearch = (e) => {
    e.preventDefault();
    if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  const appBrand = (
    <div className="flex items-center gap-2">
      <IconButton icon={Grip} label={COPY.SHELL.APP_LAUNCHER} variant="ghost" size="sm" onClick={() => setLauncher(true)} />
      <span className="truncate text-title text-fg">{app?.label ?? BRAND.NAME}</span>
    </div>
  );

  return (
    <div className="min-h-screen">
      <div className="flex h-12 items-center gap-3 border-b border-line bg-surface px-gutter">
        <Link to="/" className="flex items-center gap-2 rounded-control text-label text-fg focus-ring">
          <BRAND.ICON aria-hidden="true" className="h-5 w-5" />
          <span className="hidden sm:inline">{BRAND.NAME}</span>
        </Link>
        <form role="search" onSubmit={submitSearch} className="mx-auto hidden w-full max-w-xl md:block">
          <Input fieldSize="sm" aria-label={COPY.SHELL.SEARCH_LABEL} placeholder={COPY.SHELL.SEARCH_PLACEHOLDER}
            leading={<Search aria-hidden="true" className="h-4 w-4" />} value={query} onChange={(e) => setQuery(e.target.value)} />
        </form>
        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <IconButton icon={Search} label={COPY.SHELL.COMMANDS} variant="ghost" size="sm" className="md:hidden" onClick={() => setPalette(true)} />
          <NotificationBell />
          <Tooltip content={COPY.SHELL.RECYCLE_BIN}>
            <IconButton icon={Trash2} label={COPY.SHELL.RECYCLE_BIN} variant="ghost" size="sm" onClick={() => navigate("/recycle-bin")} />
          </Tooltip>
          {isAdmin && (
            <Tooltip content={COPY.SHELL.SETUP}>
              <IconButton icon={Settings} label={COPY.SHELL.SETUP} variant="ghost" size="sm" onClick={() => navigate("/setup")} />
            </Tooltip>
          )}
          <Menu label={user.name} align="end"
            trigger={<Button variant="ghost" size="sm" aria-label={user.name}><Avatar name={user.name} size="sm" /></Button>}
            items={[
              { label: user.email, disabled: true, group: user.name },
              { label: COPY.EMAIL.OUTBOX, icon: Mail, onSelect: () => navigate("/outbox") },
              { label: isDark ? COPY.SHELL.THEME_LIGHT : COPY.SHELL.THEME_DARK, icon: isDark ? Sun : Moon, onSelect: toggleTheme },
              { label: COPY.SHELL.SIGN_OUT, icon: LogOut, tone: "danger", onSelect: signOut },
            ]} />
        </div>
      </div>
      <TopNav fluid brand={appBrand} label={COPY.SHELL.NAV_LABEL} linkAs={Link} collapseBelow="lg"
        items={tabs.map((t) => ({ label: t.label, to: t.to, active: isActive(t, pathname) }))} />
      <main className="mx-auto w-full max-w-[1600px] px-gutter pb-24 pt-6 lg:pb-6">
        <Outlet />
      </main>
      <BottomBar className="lg:hidden" label={COPY.SHELL.NAV_LABEL} navigation={[
        { name: COPY.SHELL.PAGES["@home"], href: "/", icon: Home },
        ...tabs.filter((t) => !t.key.startsWith("@")).slice(0, 3).map((t) => ({ name: t.label, href: t.to, icon: objectIcon(t.icon) })),
        { name: COPY.SHELL.MORE, icon: LayoutGrid, onClick: () => setLauncher(true) },
      ]} />
      <AppLauncher open={launcher} onClose={() => setLauncher(false)} />
      <CommandPalette open={palette} onClose={() => setPalette(false)} commands={commands}
        placeholder={COPY.SHELL.COMMANDS} emptyLabel={COPY.SHELL.COMMANDS_EMPTY} />
    </div>
  );
}
