import { COPY } from "@/copy.js";

const PAGE_PATHS = { "@home": "/", "@calendar": "/calendar", "@chatter": "/chatter", "@reports": "/reports", "@dashboards": "/dashboards", "@forecasts": "/forecasts" };

export function tabsFor(app, objects) {
  if (!app) return [];
  const byName = new Map(objects.map((o) => [o.name, o]));
  const custom = objects.filter((o) => o.custom).map((o) => o.name);
  return [...app.tabs, ...custom].flatMap((tab) => {
    if (tab.startsWith("@")) return [{ key: tab, label: COPY.SHELL.PAGES[tab], to: PAGE_PATHS[tab] }];
    const o = byName.get(tab);
    return o ? [{ key: tab, label: o.plural, to: `/o/${o.name}`, icon: o.icon }] : [];
  });
}

export function isActive(tab, pathname) {
  if (tab.to === "/") return pathname === "/";
  if (tab.key.startsWith("@")) return pathname.startsWith(tab.to);
  return pathname.startsWith(`/o/${tab.key}`) || pathname.startsWith(`/r/${tab.key}/`);
}
