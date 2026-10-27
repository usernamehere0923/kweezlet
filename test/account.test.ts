import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { api, login, signedIn } from "./helpers";

describe("account", () => {
  it("stores the language setting", async () => {
    const { cookie } = await signedIn("anna");
    const res = await api("/api/me/settings", { method: "PATCH", cookie, json: { locale: "de-CH" } });
    expect(res.status).toBe(200);
    expect(await (await api("/api/me", { cookie })).json()).toEqual({
      username: "anna",
      locale: "de-CH",
      level: "admin",
      theme: "cardigan",
    });
  });

  it("rejects an unknown language", async () => {
    const { cookie } = await signedIn("anna");
    const res = await api("/api/me/settings", { method: "PATCH", cookie, json: { locale: "fr" } });
    expect(res.status).toBe(400);
  });

  it("stores the theme and leaves the language alone", async () => {
    const { cookie } = await signedIn("anna");
    await api("/api/me/settings", { method: "PATCH", cookie, json: { locale: "de-CH" } });
    const res = await api("/api/me/settings", { method: "PATCH", cookie, json: { theme: "kung-fu" } });
    expect(res.status).toBe(200);
    expect(await (await api("/api/me", { cookie })).json()).toEqual(
      expect.objectContaining({ locale: "de-CH", theme: "kung-fu" }),
    );
  });

  it("rejects an unknown theme", async () => {
    const { cookie } = await signedIn("anna");
    const res = await api("/api/me/settings", { method: "PATCH", cookie, json: { theme: "neon" } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "validation", fields: { theme: "invalid_value" } });
  });

  it("an empty settings change changes nothing", async () => {
    const { cookie } = await signedIn("anna");
    const res = await api("/api/me/settings", { method: "PATCH", cookie, json: {} });
    expect(res.status).toBe(200);
    expect(await (await api("/api/me", { cookie })).json()).toEqual(
      expect.objectContaining({ locale: "en", theme: "cardigan" }),
    );
  });

  it("a stored theme that no longer exists comes back as the default", async () => {
    const { cookie, id } = await signedIn("anna");
    await env.DB.prepare("UPDATE users SET theme = 'retired' WHERE id = ?").bind(id).run();
    expect(await (await api("/api/me", { cookie })).json()).toEqual(expect.objectContaining({ theme: "cardigan" }));
  });

  it("the theme is the account's own", async () => {
    const { cookie: anna } = await signedIn("anna");
    const { cookie: ben } = await signedIn("ben");
    await api("/api/me/settings", { method: "PATCH", cookie: anna, json: { theme: "ballpoint" } });
    expect(await (await api("/api/me", { cookie: ben })).json()).toEqual(
      expect.objectContaining({ theme: "cardigan" }),
    );
  });

  it("password change needs the current password", async () => {
    const { cookie } = await signedIn("anna");
    const res = await api("/api/me/password", {
      method: "POST",
      cookie,
      json: { current: "wrong", next: "new-password" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "validation", fields: { current: "wrong_password" } });
  });

  it("password change logs out the other devices but not this one", async () => {
    const { cookie: phone } = await signedIn("anna");
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
