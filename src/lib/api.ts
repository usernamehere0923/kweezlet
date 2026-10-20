import { hc } from "hono/client";
import type { AppType } from "../../worker/index";
import { isTKey, type TKey } from "../i18n";

export const UNAUTHORIZED_EVENT = "kz:unauthorized";
export const SERVER_ERROR_EVENT = "kz:server-error";

/**
 * Every API call goes through here. It reports problems centrally:
 *   401 -> back to the login page,  5xx / no connection -> an error toast.
 * It never throws: without a connection the call answers Response.error()
 * (ok false, status 0), so a page handles it like any failed request.
 */
async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(input, { ...init, credentials: "same-origin" });
  } catch {
    window.dispatchEvent(new CustomEvent(SERVER_ERROR_EVENT, { detail: "offline" }));
    return Response.error();
  }
  const url = String(input instanceof Request ? input.url : input);
  if (res.status === 401 && !url.endsWith("/api/login")) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
  if (res.status >= 500) window.dispatchEvent(new CustomEvent(SERVER_ERROR_EVENT, { detail: "server" }));
  return res;
}

/**
 * The typed API client. Paths and bodies are checked against the worker's routes:
 *
 *   const res = await api.me.$get();
 *   if (res.ok) { const me = await res.json(); }   // me is typed
 *
 *   await api.me.settings.$patch({ json: { locale: "de-CH" } });
 */
export const api = hc<AppType>("/", { fetch: apiFetch }).api;

/** The call never reached the server (no connection). The toast is already showing. */
export function offline(res: { type: string }): boolean {
  return res.type === "error";
}

/**
 * Field errors from a 400 response, as i18n keys: { password: "validation.too_small" }.
 * A code without a text of its own becomes "validation.invalid".
 * Pass each one to t() and into <TextField error=...>.
 */
export async function fieldErrors(res: Response): Promise<Record<string, TKey>> {
  if (res.status !== 400) return {};
  try {
    const body = (await res.clone().json()) as { fields?: Record<string, string> };
    return Object.fromEntries(
      Object.entries(body.fields ?? {}).map(([field, code]) => {
        const key = `validation.${code}`;
        return [field, isTKey(key) ? key : "validation.invalid"];
      }),
    );
  } catch {
    return {};
  }
}
