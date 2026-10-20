import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { PublicUser } from "../../worker/types";
import { useT } from "../i18n";
import { api, UNAUTHORIZED_EVENT } from "./api";

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

const SessionContext = createContext<SessionApi | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ status: "loading", user: null });
  const { setLocale } = useT();

  const signedIn = useCallback(
    (me: Me) => {
      setSession({ status: "loggedIn", user: me });
      setLocale(me.locale);
    },
    [setLocale],
  );

  const refresh = useCallback(
    () =>
      api.me
        .$get()
        .then(async (res) => (res.ok ? signedIn(await res.json()) : setSession({ status: "anonymous", user: null })))
        .catch(() => setSession((s) => (s.status === "loading" ? { status: "anonymous", user: null } : s))),
    [signedIn],
  );

  const logout = useCallback(async () => {
    await api.logout.$post().catch(() => undefined);
    setSession({ status: "anonymous", user: null });
  }, []);

  useEffect(() => void refresh(), [refresh]);
  useEffect(() => {
    const onUnauthorized = () => setSession({ status: "anonymous", user: null });
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

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
