import { describe, expect, it } from "vitest";
import { addUser, api, login } from "./helpers";

describe("auth", () => {
  it("logs in with the right password and sets an HttpOnly cookie", async () => {
    await addUser("anna", "secret-pw");
    const res = await api("/api/login", { method: "POST", json: { username: "anna", password: "secret-pw" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ username: "anna", locale: "en" });
    const cookie = res.headers.get("Set-Cookie")!;
    expect(cookie).toMatch(/kz_session=[0-9a-f]{64}/);
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it("rejects a wrong password and an unknown user the same way", async () => {
    await addUser("anna", "secret-pw");
    for (const body of [
      { username: "anna", password: "nope" },
      { username: "nobody", password: "nope" },
    ]) {
      const res = await api("/api/login", { method: "POST", json: body });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "invalid_credentials" });
    }
  });

  it("answers 401 on protected routes without a session", async () => {
    expect((await api("/api/me")).status).toBe(401);
    expect((await api("/api/anything-new")).status).toBe(401);
  });

  it("logout ends the session", async () => {
    await addUser("anna", "secret-pw");
    const cookie = await login("anna", "secret-pw");
    expect((await api("/api/me", { cookie })).status).toBe(200);
    expect((await api("/api/logout", { method: "POST", cookie })).status).toBe(200);
    expect((await api("/api/me", { cookie })).status).toBe(401);
  });

  it("locks a username after 5 failures in 15 minutes", async () => {
    await addUser("anna", "secret-pw");
    for (let i = 0; i < 5; i++) {
      await api("/api/login", { method: "POST", json: { username: "anna", password: "wrong" } });
    }
    const res = await api("/api/login", { method: "POST", json: { username: "anna", password: "secret-pw" } });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "rate_limited" });
  });

  it("answers 400 with field codes for an invalid body", async () => {
    const res = await api("/api/login", { method: "POST", json: { username: "", password: 42 } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "validation",
      fields: { username: "too_small", password: "invalid_type" },
    });
  });
});
