import { useCallback, useEffect, useMemo, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { LoadingPage, ErrorState, useNotifications } from "@kasumi/ui";
import { api } from "@/api.js";
import { COPY } from "@/copy.js";
import { SessionContext } from "@/hooks.js";
import { setCurrencyContext } from "@/format.js";
import Login from "@/pages/Login.jsx";
import Shell from "@/shell/Shell.jsx";
import Home from "@/pages/Home.jsx";
import ObjectHome from "@/pages/ObjectHome.jsx";
import RecordPage from "@/pages/RecordPage.jsx";
import SearchResults from "@/pages/SearchResults.jsx";
import RecycleBin from "@/pages/RecycleBin.jsx";
import CalendarPage from "@/pages/CalendarPage.jsx";
import Chatter from "@/pages/Chatter.jsx";
import Outbox from "@/pages/Outbox.jsx";
import Forecasts from "@/pages/Forecasts.jsx";
import Reports from "@/insight/Reports.jsx";
import ReportPage from "@/insight/ReportPage.jsx";
import Dashboards from "@/insight/Dashboards.jsx";
import DashboardPage from "@/insight/DashboardPage.jsx";
import SetupRoutes from "@/setup/SetupRoutes.jsx";
import NotFound from "@/pages/NotFound.jsx";

const APP_KEY = "yac-crm-app";

function readApp() {
  try {
    return localStorage.getItem(APP_KEY) || "sales";
  } catch {
    return "sales";
  }
}

export default function App() {
  const { notify } = useNotifications();
  const [user, setUser] = useState(undefined);
  const [bootError, setBootError] = useState(null);
  const [apps, setApps] = useState([]);
  const [objects, setObjects] = useState([]);
  const [appName, setAppName] = useState(readApp);

  const loadSession = useCallback(() => {
    setBootError(null);
    api("/me").then(
      (me) => setUser(me),
      (err) => (err.status === 401 ? setUser(null) : setBootError(err)),
    );
  }, []);

  const reloadObjects = useCallback(() => api("/meta/objects").then(setObjects, (err) => notify(err.message, "error")), [notify]);
  const [currency, setCurrency] = useState(null);
  const reloadCurrency = useCallback(() => api("/meta/currencies").then(
    (c) => { setCurrencyContext(c); setCurrency(c); },
    (err) => notify(err.message, "error"),
  ), [notify]);

  useEffect(loadSession, [loadSession]);
  useEffect(() => {
    if (!user) return;
    api("/meta/apps").then(setApps, (err) => notify(err.message, "error"));
    reloadObjects();
    reloadCurrency();
  }, [user, notify, reloadObjects, reloadCurrency]);
  useEffect(() => {
    const onSignedOut = () => {
      setUser((current) => {
        if (current) notify(COPY.SHELL.SIGNED_OUT, "warning");
        return null;
      });
    };
    window.addEventListener("crm:signed-out", onSignedOut);
    return () => window.removeEventListener("crm:signed-out", onSignedOut);
  }, [notify]);

  const session = useMemo(() => ({
    user, apps, objects, reloadObjects, currency, reloadCurrency,
    app: apps.find((a) => a.name === appName) ?? apps[0] ?? null,
    setApp: (name) => {
      setAppName(name);
      try { localStorage.setItem(APP_KEY, name); } catch { /* storage unavailable */ }
    },
    signOut: () => api("/auth/logout", { method: "POST" }).then(() => setUser(null), (err) => notify(err.message, "error")),
    isAdmin: user?.profile === "admin",
  }), [user, apps, objects, appName, reloadObjects, currency, reloadCurrency, notify]);

  if (bootError) return <ErrorState message={bootError.message} onRetry={loadSession} retryLabel={COPY.COMMON.RETRY} />;
  if (user === undefined) return <LoadingPage />;
  if (!user) return <Login onSignedIn={setUser} />;

  return (
    <SessionContext.Provider value={session}>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Home />} />
          <Route path="o/:object" element={<ObjectHome />} />
          <Route path="r/:object/:id" element={<RecordPage />} />
          <Route path="search" element={<SearchResults />} />
          <Route path="recycle-bin" element={<RecycleBin />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="chatter" element={<Chatter />} />
          <Route path="outbox" element={<Outbox />} />
          <Route path="forecasts" element={<Forecasts />} />
          <Route path="reports" element={<Reports />} />
          <Route path="reports/:id" element={<ReportPage />} />
          <Route path="dashboards" element={<Dashboards />} />
          <Route path="dashboards/:id" element={<DashboardPage />} />
          <Route path="setup/*" element={<SetupRoutes />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </SessionContext.Provider>
  );
}
