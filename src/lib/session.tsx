import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { PublicUser } from "../../worker/types";
import { useT } from "../i18n";
import { api, UNAUTHORIZED_EVENT } from "./api";
import { setFlushOwner } from "./studyTime";
import { useTheme } from "./theme";

type Me = PublicUser;

type Session =
  { status: "loading"; user: null } | { status: "anonymous"; user: null } | { status: "loggedIn"; user: Me };

type SessionApi = Session & {
  /** Called by the login page after a successful login. */
  signedIn: (me: Me) => void;
  logout: () => Promise<void>;
  /** Reloads the user from the server (e.g. after another device changed a setting). */
  refresh: () => Promise<void>;
};

const ANONYMOUS: Session = { status: "anonymous", user: null };

const SessionContext = createContext<SessionApi | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setStoredSession] = useState<Session>({ status: "loading", user: null });
  // Every session change goes through here, so the study-time queue always
  // knows whose flushes it may send (src/lib/studyTime.ts). Right away, not in
  // an effect: a study page mounting in the same render must already see it.
  const setSession = useCallback((next: Session) => {
    setFlushOwner(next.status === "loggedIn" ? next.user.username : null);
    setStoredSession(next);
  }, []);
  const { setLocale } = useT();
  const { setTheme } = useTheme();

  const signedIn = useCallback(
    (me: Me) => {
      setSession({ status: "loggedIn", user: me });
      setLocale(me.locale);
      setTheme(me.theme);
    },
    [setSession, setLocale, setTheme],
  );

  const refresh = useCallback(() => {
    // Only a 401 means logged out, and api.ts reports that (UNAUTHORIZED_EVENT,
    // below). A server error or no connection keeps the session as it is; on
    // the first load there is none yet, so: the login.
    // Loading → anonymous: nobody was logged in, so the queue's owner stays null.
    const failed = () => setStoredSession((s) => (s.status === "loading" ? ANONYMOUS : s));
    return api.me.$get().then(async (res) => (res.ok ? signedIn(await res.json()) : failed()));
  }, [signedIn]);

  const logout = useCallback(async () => {
    await api.logout.$post();
    setSession(ANONYMOUS);
  }, [setSession]);

  useEffect(() => void refresh(), [refresh]);
  useEffect(() => {
    const onUnauthorized = () => setSession(ANONYMOUS);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [setSession]);

  const value = useMemo(() => ({ ...session, signedIn, logout, refresh }), [session, signedIn, logout, refresh]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionApi {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession() needs <SessionProvider>");
  return ctx;
}

/** For pages behind the login: the user is always there. */
export function useUser(): Me {
  const session = useSession();
  if (session.status !== "loggedIn") throw new Error("useUser() outside a logged-in page");
  return session.user;
}
