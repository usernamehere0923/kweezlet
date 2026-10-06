import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

/** Identifies this tab, so it can ignore its own messages. Not crypto.randomUUID:
 *  that is missing on plain http (the iPhone test URL). */
export const clientId = Math.random().toString(36).slice(2) + Date.now().toString(36);

type Listener = (data: unknown, info: { reconnected: boolean }) => void;
type Channel = { subscribe: (topic: string, listener: Listener) => () => void };

const LiveContext = createContext<Channel | null>(null);

/**
 * Keeps one WebSocket to /api/live while logged in, and reconnects (1s, 2s,
 * 4s... up to 30s) when the phone sleeps or the network drops. After a
 * reconnect every listener is called with { reconnected: true }, so it can
 * refetch whatever it missed.
 */
export function LiveProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const listeners = useRef(new Map<string, Set<Listener>>());
  const [channel] = useState<Channel>(() => ({
    subscribe(topic, listener) {
      const set = listeners.current.get(topic) ?? new Set();
      set.add(listener);
      listeners.current.set(topic, set);
      return () => set.delete(listener);
    },
  }));

  useEffect(() => {
    if (!enabled) return;
    let ws: WebSocket | null = null;
    let stopped = false;
    let attempts = 0;
    let everConnected = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let keepAlive: ReturnType<typeof setInterval> | undefined;

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/api/live`);
      ws.onopen = () => {
        attempts = 0;
        if (everConnected) {
          for (const set of listeners.current.values()) for (const l of set) l(undefined, { reconnected: true });
        }
        everConnected = true;
        keepAlive = setInterval(() => ws?.send("ping"), 25_000);
      };
      ws.onmessage = (event) => {
        if (event.data === "pong") return;
        try {
          const { topic, data } = JSON.parse(event.data as string) as { topic: string; data: unknown };
          for (const l of listeners.current.get(topic) ?? []) l(data, { reconnected: false });
        } catch {
          // not ours
        }
      };
      ws.onclose = () => {
        clearInterval(keepAlive);
        if (stopped) return;
        retryTimer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** attempts++));
      };
    };

    // Coming back to a sleeping phone: reconnect right away instead of waiting for the backoff.
    const onVisible = () => {
      if (document.visibilityState === "visible" && ws?.readyState === WebSocket.CLOSED) {
        clearTimeout(retryTimer);
        attempts = 0;
        connect();
      }
    };

    // Deferred one tick: React's dev double-mount would otherwise open and
    // immediately close a socket, which logs a warning.
    retryTimer = setTimeout(connect, 0);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      clearInterval(keepAlive);
      document.removeEventListener("visibilitychange", onVisible);
      ws?.close();
    };
  }, [enabled]);

  return <LiveContext.Provider value={channel}>{children}</LiveContext.Provider>;
}

/**
 * Runs `onMessage` whenever the worker calls notify(env, userId, topic).
 * Typical use: refetch.
 *
 *   useLive("sets", () => void loadSets());
 */
export function useLive(topic: string, onMessage: Listener): void {
  const channel = useContext(LiveContext);
  const latest = useRef(onMessage);
  useEffect(() => {
    latest.current = onMessage;
  });
  useEffect(() => {
    if (!channel) return;
    return channel.subscribe(topic, (data, info) => latest.current(data, info));
  }, [channel, topic]);
}
