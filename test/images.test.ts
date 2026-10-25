// A term's image ("media on cards"): one data URL per term, always scoped to
// its owner. The ownership pattern is in test/ownership.test.ts.
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { exportUserData } from "../worker/export";
import { addImage, addSet } from "./fixtures";
import { addUser, api, login, signedIn } from "./helpers";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

function nextMessage(ws: WebSocket): Promise<unknown> {
  return new Promise((resolve) => {
    ws.addEventListener("message", (e) => resolve(JSON.parse(e.data as string)), { once: true });
  });
}

async function imageOf(userId: number, termId: number): Promise<string | null> {
  const row = await env.DB.prepare("SELECT image FROM term_images WHERE user_id = ? AND term_id = ?")
    .bind(userId, termId)
    .first<{ image: string }>();
  return row?.image ?? null;
}

describe("PUT /api/terms/:id/image", () => {
  it("stores the image on my term", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const { termIds } = await addSet(anna, "Spanish animals", { terms: [["el gato", "the cat"]] });

    const res = await api(`/api/terms/${termIds[0]}/image`, { method: "PUT", json: { image: PNG }, cookie });
    expect(res.status).toBe(200);
    expect(await imageOf(anna, termIds[0])).toBe(PNG);
  });

  it("replaces the image on a term instead of adding a second row", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const { termIds } = await addSet(anna, "Spanish animals", { terms: [["el gato", "the cat"]] });
    await addImage(anna, termIds[0], "data:image/png;base64,OLD=");

    await api(`/api/terms/${termIds[0]}/image`, { method: "PUT", json: { image: PNG }, cookie });
    const { results } = await env.DB.prepare("SELECT * FROM term_images WHERE user_id = ?").bind(anna).all();
    expect(results).toHaveLength(1);
    expect(await imageOf(anna, termIds[0])).toBe(PNG);
  });

  it("image: null takes the image off again", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const { termIds } = await addSet(anna, "Spanish animals", { terms: [["el gato", "the cat"]] });
    await addImage(anna, termIds[0]);

    const res = await api(`/api/terms/${termIds[0]}/image`, { method: "PUT", json: { image: null }, cookie });
    expect(res.status).toBe(200);
    expect(await imageOf(anna, termIds[0])).toBeNull();
  });

  it("another user's term is not mine: 404, nothing stored", async () => {
    const anna = await addUser("anna", "secret-pw");
    const { cookie: benCookie, id: ben } = await signedIn("ben");
    const { termIds } = await addSet(anna, "Annas set", { terms: [["a", "b"]] });

    const res = await api(`/api/terms/${termIds[0]}/image`, { method: "PUT", json: { image: PNG }, cookie: benCookie });
    expect(res.status).toBe(404);
    expect(await imageOf(ben, termIds[0])).toBeNull();
  });

  it("only accepts a png/jpeg/webp data URL of a sane size", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const { termIds } = await addSet(anna, "Spanish animals", { terms: [["el gato", "the cat"]] });
    const put = (image: unknown) => api(`/api/terms/${termIds[0]}/image`, { method: "PUT", json: { image }, cookie });

    const wrong = await put("https://example.com/cat.jpg");
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toEqual({ error: "validation", fields: { image: "invalid_format" } });

    const svg = await put("data:image/svg+xml;base64,PGI+");
    expect(svg.status).toBe(400);

    const tooBig = await put(`data:image/jpeg;base64,${"A".repeat(600_000)}`);
    expect(tooBig.status).toBe(400);
    expect(await tooBig.json()).toEqual({ error: "validation", fields: { image: "too_big" } });
    expect(await imageOf(anna, termIds[0])).toBeNull();
  });

  it("a change reaches the user's other devices", async () => {
    const { id: anna, cookie: phone } = await signedIn("anna");
    const { termIds } = await addSet(anna, "Spanish animals", { terms: [["el gato", "the cat"]] });
    const mac = await login("anna", "secret-pw");

    const res = await api("/api/live", { cookie: mac, headers: { Upgrade: "websocket" } });
    const ws = res.webSocket!;
    ws.accept();
    const received = nextMessage(ws);

    await api(`/api/terms/${termIds[0]}/image`, { method: "PUT", json: { image: PNG }, cookie: phone });
    expect(await received).toEqual({ topic: "sets" });
    ws.close();
  });
});

describe("GET /api/sets/:id/images", () => {
  it("answers { termId: dataUrl } and skips terms without one", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const { id: set, termIds } = await addSet(anna, "Spanish animals", {
      terms: [
        ["el gato", "the cat"],
        ["el perro", "the dog"],
      ],
    });
    await addImage(anna, termIds[0], PNG);

    const res = await api(`/api/sets/${set}/images`, { cookie });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ images: { [termIds[0]]: PNG } });
  });

  it("another user's set is not mine: 404", async () => {
    const anna = await addUser("anna", "secret-pw");
    const { cookie } = await signedIn("ben");
    const { id: set } = await addSet(anna, "Annas set");

    const res = await api(`/api/sets/${set}/images`, { cookie });
    expect(res.status).toBe(404);
  });
});

describe("term images in the database", () => {
  it("are part of the user's export", async () => {
    const { id: anna } = await signedIn("anna");
    const ben = await addUser("ben", "secret-pw");
    const { termIds } = await addSet(anna, "Spanish animals", { terms: [["el gato", "the cat"]] });
    await addImage(anna, termIds[0], PNG);
    const { termIds: benTerms } = await addSet(ben, "Ben set", { terms: [["x", "y"]] });
    await addImage(ben, benTerms[0]);

    const data = await exportUserData(env.DB, anna);
    expect(data.term_images).toEqual([expect.objectContaining({ user_id: anna, term_id: termIds[0], image: PNG })]);
  });

  it("go away with the term they belong to", async () => {
    const { id: anna } = await signedIn("anna");
    const { termIds } = await addSet(anna, "Spanish animals", { terms: [["el gato", "the cat"]] });
    await addImage(anna, termIds[0]);

    await env.DB.prepare("DELETE FROM terms WHERE id = ? AND user_id = ?").bind(termIds[0], anna).run();
    expect(await imageOf(anna, termIds[0])).toBeNull();
  });
});
