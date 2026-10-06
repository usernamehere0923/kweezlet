import { DurableObject } from "cloudflare:workers";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "./types";
import { validate } from "./validate";

/**
 * One instance per user. Every open tab or device of that user holds a
 * WebSocket to it, and notify() sends a message to all of them.
 *
 * Hibernation API: while nobody sends anything, the object sleeps and costs
 * nothing. The client's keep-alive "ping" is answered without waking it.
 */
export class UserChannel extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(): Promise<Response> {
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  broadcast(message: string): void {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(message);
      } catch {
        // socket already gone; the runtime cleans it up
      }
    }
  }

  webSocketClose(ws: WebSocket, code: number, reason: string): void {
    try {
      ws.close(code, reason);
    } catch {
      // already closed
    }
  }
}

/**
 * Tell every open tab/device of this user that something changed.
 * The UI listens with useLive(topic, callback) and usually just refetches.
 *
 *   await notify(c.env, c.get("user").id, "sets");
 */
export async function notify(env: Env, userId: number, topic: string, data?: unknown): Promise<void> {
  const stub = env.USER_CHANNEL.get(env.USER_CHANNEL.idFromName(String(userId)));
  await stub.broadcast(JSON.stringify({ topic, data }));
}

export const liveRoutes = new Hono<AppEnv>()
  .get("/live", (c) => {
    if (c.req.header("Upgrade") !== "websocket") {
      return c.json({ error: "expected_websocket" as const }, 426);
    }
    const ns = c.env.USER_CHANNEL;
    return ns.get(ns.idFromName(String(c.get("user").id))).fetch(c.req.raw);
  })
  // Demo for /design: shows a toast on the user's other devices.
  .post("/live/ping", validate("json", z.object({ from: z.string().max(64) })), async (c) => {
    await notify(c.env, c.get("user").id, "ping", { from: c.req.valid("json").from });
    return c.json({ ok: true as const }, 200);
  });
