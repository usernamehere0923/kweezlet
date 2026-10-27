import { vi } from "vitest";

type Answer = { status?: number; json?: unknown } | undefined;
/** A route; it may answer later (a Promise), to hold one request back. */
type Handler = (body: unknown, query: Record<string, string>) => Answer | Promise<Answer>;

/** A fake API: routes keyed "METHOD /path". Unrouted calls answer 404. */
export function mockApi(routes: Record<string, Handler>) {
  const calls: { method: string; path: string; query: Record<string, string>; body: unknown }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(new URL(String(input), location.href), init);
    const url = new URL(req.url);
    const text = await req.text();
    const body: unknown = text ? JSON.parse(text) : undefined;
    const query = Object.fromEntries(url.searchParams);
    calls.push({ method: req.method, path: url.pathname, query, body });
    const res = (await routes[`${req.method} ${url.pathname}`]?.(body, query)) ?? { status: 404 };
    return new Response(res.json === undefined ? null : JSON.stringify(res.json), {
      status: res.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

/** Stands in for the browser WebSocket; tests drive it through FakeSocket.last. */
export class FakeSocket {
  static CLOSED = 3;
  static instances: FakeSocket[] = [];
  static get last(): FakeSocket {
    return FakeSocket.instances[FakeSocket.instances.length - 1];
  }
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = FakeSocket.CLOSED;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(data: string) {
    this.onmessage?.({ data });
  }
  drop() {
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.();
  }
}
