import { useEffect } from "react";
import { Route, Routes, useLocation } from "react-router";
import { I18nProvider, useT } from "./i18n";
import { SERVER_ERROR_EVENT } from "./lib/api";
import { clientId, LiveProvider, useLive } from "./lib/live";
import { SessionProvider, useSession } from "./lib/session";
import { DesignSystemPage } from "./pages/DesignSystem";
import { HomePage } from "./pages/Home";
import { LoginPage } from "./pages/Login";
import { NotFoundPage } from "./pages/NotFound";
import { SettingsPage } from "./pages/Settings";
import { AppShell, ErrorBoundary, Spinner, ToastProvider, useToast, type NavItem } from "./ui";

export function App() {
  return (
    <I18nProvider>
      <ToastProvider>
        <SessionProvider>
          <Root />
        </SessionProvider>
      </ToastProvider>
    </I18nProvider>
  );
}

function Root() {
  const session = useSession();
  const { t } = useT();
  const toast = useToast();

  useEffect(() => {
    const onError = (e: Event) =>
      toast(t((e as CustomEvent).detail === "offline" ? "errors.offline" : "errors.server"), "error");
    window.addEventListener(SERVER_ERROR_EVENT, onError);
    return () => window.removeEventListener(SERVER_ERROR_EVENT, onError);
  }, [t, toast]);

  if (session.status === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center text-muted">
        <Spinner size={28} label={t("common.loading")} />
      </div>
    );
  }
  if (session.status === "anonymous") return <LoginPage />;

  return (
    <LiveProvider enabled>
      <LiveSync />
      <LoggedInApp />
    </LiveProvider>
  );
}

/** App-wide reactions to the other devices (see worker notify()). */
function LiveSync() {
  const { refresh } = useSession();
  const { t } = useT();
  const toast = useToast();
  useLive("settings", () => void refresh());
  useLive("ping", (data) => {
    if ((data as { from?: string } | undefined)?.from !== clientId) toast(t("design.pingReceived"), "info");
  });
  return null;
}

function LoggedInApp() {
  const { t } = useT();
  const location = useLocation();
  // Add your pages here, and to `nav` if they belong in the menu (max 4-5 for the phone tab bar).
  const nav: NavItem[] = [
    { to: "/", label: t("nav.home"), icon: "learn" },
    { to: "/design", label: t("nav.design"), icon: "feather" },
    { to: "/settings", label: t("nav.settings"), icon: "settings" },
  ];
  return (
    <AppShell nav={nav} navLabel={t("nav.main")}>
      <ErrorBoundary key={location.pathname}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/design" element={<DesignSystemPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </ErrorBoundary>
    </AppShell>
  );
}
