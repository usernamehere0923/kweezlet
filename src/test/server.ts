import { vi } from "vitest";

type Handler = (body: unknown, query: Record<string, string>) => { status?: number; json?: unknown } | undefined;

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
    const res = routes[`${req.method} ${url.pathname}`]?.(body, query) ?? { status: 404 };
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

/** What a fake utterance carries; `spoken` collects every one that was made. */
export type FakeUtterance = {
  text: string;
  lang: string;
  voice: { lang: string } | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

/**
 * Stub for the Web Speech API (jsdom has none). `spoken` collects what was
 * said, `synthesis` records speak() and cancel() calls.
 *
 *   const { spoken, synthesis } = mockSpeech([{ lang: "de-DE" }]);
 */
export function mockSpeech(voices: { lang: string }[] = []) {
  const spoken: FakeUtterance[] = [];
  class Utterance implements FakeUtterance {
    text: string;
    lang = "";
    voice: { lang: string } | null = null;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(text: string) {
      this.text = text;
      spoken.push(this);
    }
  }
  const synthesis = { speak: vi.fn(), cancel: vi.fn(), getVoices: () => voices };
  vi.stubGlobal("SpeechSynthesisUtterance", Utterance);
  vi.stubGlobal("speechSynthesis", synthesis);
  return { spoken, synthesis };
}
