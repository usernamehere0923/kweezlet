import { useEffect } from "react";
import { Route, Routes, useLocation } from "react-router";
import { I18nProvider, useT } from "./i18n";
import { SERVER_ERROR_EVENT } from "./lib/api";
import { clientId, LiveProvider, useLive } from "./lib/live";
import { SessionProvider, useSession } from "./lib/session";
import { AiDraftPage } from "./pages/AiDraft";
import { AiSourcePage } from "./pages/AiSource";
import { DesignSystemPage } from "./pages/design";
import { HomePage } from "./pages/Home";
import { LoginPage } from "./pages/Login";
import { NotFoundPage } from "./pages/NotFound";
import { ReviewPage } from "./pages/Review";
import { SettingsPage } from "./pages/Settings";
import { SetDetailPage } from "./pages/SetDetail";
import { SetFormPage } from "./pages/SetForm";
import { FlashcardsPage } from "./pages/Flashcards";
import { LearnPage } from "./pages/Learn";
import { MatchPage } from "./pages/Match";
import { TestPage } from "./pages/Test";
import {
  AppShell,
  DevRibbon,
  ErrorBoundary,
  HotkeyInput,
  PageLoading,
  ToastProvider,
  useToast,
  type NavItem,
} from "./ui";

export function App() {
  return (
    <I18nProvider>
      <HotkeyInput>
        <ToastProvider>
          <SessionProvider>
            <Root />
          </SessionProvider>
        </ToastProvider>
      </HotkeyInput>
      {/* Only on `npm run dev`; the live app never shows it. */}
      {import.meta.env.DEV && <DevRibbon />}
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
    return <PageLoading fullScreen />;
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
    if ((data as { from?: string } | undefined)?.from !== clientId) toast(t("live.pingReceived"), "info");
  });
  return null;
}

function LoggedInApp() {
  const { t } = useT();
  const location = useLocation();
  // Add your pages here, and to `nav` if they belong in the menu (max 4-5 for the phone tab bar).
  const nav: NavItem[] = [
    { to: "/", label: t("nav.home"), icon: "learn" },
    { to: "/settings", label: t("nav.settings"), icon: "settings" },
  ];
  return (
    <AppShell nav={nav} navLabel={t("nav.main")}>
      <ErrorBoundary key={location.pathname}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/create/ai" element={<AiSourcePage />} />
          <Route path="/create/ai/:draftId" element={<AiDraftPage />} />
          <Route path="/sets/new" element={<SetFormPage />} />
          <Route path="/sets/:id" element={<SetDetailPage />} />
          <Route path="/sets/:id/edit" element={<SetFormPage />} />
          <Route path="/sets/:id/flashcards" element={<FlashcardsPage />} />
          <Route path="/sets/:id/learn" element={<LearnPage />} />
          <Route path="/sets/:id/match" element={<MatchPage />} />
          <Route path="/sets/:id/test" element={<TestPage />} />
          <Route path="/design" element={<DesignSystemPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </ErrorBoundary>
    </AppShell>
  );
}
