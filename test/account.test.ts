import { describe, expect, it } from "vitest";
import { addUser, api, login } from "./helpers";

describe("account", () => {
  it("stores the language setting", async () => {
    await addUser("anna", "secret-pw");
    const cookie = await login("anna", "secret-pw");
    const res = await api("/api/me/settings", { method: "PATCH", cookie, json: { locale: "de-CH" } });
    expect(res.status).toBe(200);
    expect(await (await api("/api/me", { cookie })).json()).toEqual({ username: "anna", locale: "de-CH" });
  });

  it("rejects an unknown language", async () => {
    await addUser("anna", "secret-pw");
    const cookie = await login("anna", "secret-pw");
    const res = await api("/api/me/settings", { method: "PATCH", cookie, json: { locale: "fr" } });
    expect(res.status).toBe(400);
  });

  it("password change needs the current password", async () => {
    await addUser("anna", "secret-pw");
    const cookie = await login("anna", "secret-pw");
    const res = await api("/api/me/password", {
      method: "POST",
      cookie,
      json: { current: "wrong", next: "new-password" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "validation", fields: { current: "wrong_password" } });
  });

  it("password change logs out the other devices but not this one", async () => {
    await addUser("anna", "secret-pw");
    const phone = await login("anna", "secret-pw");
    const mac = await login("anna", "secret-pw");
    const res = await api("/api/me/password", {
      method: "POST",
      cookie: mac,
      json: { current: "secret-pw", next: "new-password" },
    });
    expect(res.status).toBe(200);
    expect((await api("/api/me", { cookie: mac })).status).toBe(200);
    expect((await api("/api/me", { cookie: phone })).status).toBe(401);
    await login("anna", "new-password");
  });
});
