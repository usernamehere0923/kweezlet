import { describe, expect, it } from "vitest";
import { addUser, api, login } from "./helpers";

function nextMessage(ws: WebSocket): Promise<unknown> {
  return new Promise((resolve) => {
    ws.addEventListener("message", (e) => resolve(JSON.parse(e.data as string)), { once: true });
  });
}

describe("live sync", () => {
  it("notify() reaches the user's other open sockets", async () => {
    await addUser("anna", "secret-pw");
    const phone = await login("anna", "secret-pw");
    const mac = await login("anna", "secret-pw");

    const res = await api("/api/live", { cookie: mac, headers: { Upgrade: "websocket" } });
    expect(res.status).toBe(101);
    const ws = res.webSocket!;
    ws.accept();
    const received = nextMessage(ws);

    await api("/api/live/ping", { method: "POST", cookie: phone, json: { from: "phone" } });
    expect(await received).toEqual({ topic: "ping", data: { from: "phone" } });
    ws.close();
  });

  it("a write reaches the other sockets after its response", async () => {
    await addUser("anna", "secret-pw");
    const phone = await login("anna", "secret-pw");
    const mac = await login("anna", "secret-pw");

    const res = await api("/api/live", { cookie: mac, headers: { Upgrade: "websocket" } });
    const ws = res.webSocket!;
    ws.accept();
    const received = nextMessage(ws);

    const created = await api("/api/sets", {
      method: "POST",
      cookie: phone,
      json: { title: "Live", terms: [{ term: "a", definition: "b" }] },
    });
    expect(created.status).toBe(201);
    expect(await received).toEqual({ topic: "sets" });
    ws.close();
  });

  it("the socket needs a session", async () => {
    const res = await api("/api/live", { headers: { Upgrade: "websocket" } });
    expect(res.status).toBe(401);
  });
});
