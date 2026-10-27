// Folders group a user's sets on Home: their own routes, and the folder on a set.
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { exportUserData } from "../worker/export";
import { addSet } from "./fixtures";
import { addUser, api, signedIn } from "./helpers";

const terms = [{ term: "el perro", definition: "the dog" }];

async function addFolder(cookie: string, name: string): Promise<number> {
  const res = await api("/api/folders", { method: "POST", cookie, json: { name } });
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: number }).id;
}

const titles = async (cookie: string, query: string) =>
  ((await (await api(`/api/sets${query}`, { cookie })).json()) as { title: string }[]).map((set) => set.title).sort();

describe("folders", () => {
  it("are listed by name with their set counts, mine only", async () => {
    const { cookie } = await signedIn("anna");
    const ben = await signedIn("ben");
    const spanish = await addFolder(cookie, "spanish");
    await addFolder(cookie, "History");
    await addFolder(ben.cookie, "Ben's");
    await api("/api/sets", { method: "POST", cookie, json: { title: "Animals", terms, folderId: spanish } });

    expect(await (await api("/api/folders", { cookie })).json()).toEqual([
      { id: expect.any(Number), name: "History", setCount: 0 },
      { id: spanish, name: "spanish", setCount: 1 },
    ]);
  });

  it("refuse a name that is too long, empty, or already one of mine", async () => {
    const { cookie } = await signedIn("anna");
    const ben = await signedIn("ben");
    await addFolder(cookie, "Spanish");
    const post = (name: string, who = cookie) => api("/api/folders", { method: "POST", cookie: who, json: { name } });
    expect(await (await post("SPANISH ")).json()).toEqual({ error: "validation", fields: { name: "taken" } });
    expect((await post("  ")).status).toBe(400);
    expect((await post("x".repeat(61))).status).toBe(400);
    // Another user may use the same name.
    expect((await post("Spanish", ben.cookie)).status).toBe(201);
  });

  it("can be renamed, not to a name already used, and not someone else's", async () => {
    const { cookie } = await signedIn("anna");
    const ben = await signedIn("ben");
    const spanish = await addFolder(cookie, "Spanish");
    await addFolder(cookie, "History");
    const rename = (id: number, name: string, who = cookie) =>
      api(`/api/folders/${id}`, { method: "PATCH", cookie: who, json: { name } });

    expect(await (await rename(spanish, "Español")).json()).toEqual({ id: spanish, name: "Español" });
    expect(await (await rename(spanish, "history")).json()).toEqual({
      error: "validation",
      fields: { name: "taken" },
    });
    expect((await rename(spanish, "Mine now", ben.cookie)).status).toBe(404);
  });

  it("deleted, leave their sets in no folder; someone else's is a 404", async () => {
    const { cookie } = await signedIn("anna");
    const ben = await signedIn("ben");
    const spanish = await addFolder(cookie, "Spanish");
    await api("/api/sets", { method: "POST", cookie, json: { title: "Animals", terms, folderId: spanish } });

    expect((await api(`/api/folders/${spanish}`, { method: "DELETE", cookie: ben.cookie })).status).toBe(404);
    expect((await api(`/api/folders/${spanish}`, { method: "DELETE", cookie })).status).toBe(200);
    const sets = (await (await api("/api/sets", { cookie })).json()) as { folderId: number | null }[];
    expect(sets).toEqual([expect.objectContaining({ folderId: null })]);
    expect((await api(`/api/folders/${spanish}`, { method: "DELETE", cookie })).status).toBe(404);
  });

  it("are part of the user's export", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    await addFolder(cookie, "Spanish");
    const ben = await addUser("ben", "secret-pw");
    await env.DB.prepare("INSERT INTO folders (user_id, name) VALUES (?, 'Ben folder')").bind(ben).run();

    expect((await exportUserData(env.DB, anna)).folders).toEqual([expect.objectContaining({ name: "Spanish" })]);
  });

  it("need a login", async () => {
    expect((await api("/api/folders")).status).toBe(401);
  });
});

describe("a set's folder", () => {
  it("filters the list: one folder, no folder, all; with a search too", async () => {
    const { id: anna, cookie } = await signedIn("anna");
    const spanish = await addFolder(cookie, "Spanish");
    for (const title of ["Animals", "Colours"]) {
      await api("/api/sets", { method: "POST", cookie, json: { title, terms, folderId: spanish } });
    }
    await addSet(anna, "History");

    expect(await titles(cookie, `?folder=${spanish}`)).toEqual(["Animals", "Colours"]);
    expect(await titles(cookie, "?folder=none")).toEqual(["History"]);
    expect(await titles(cookie, "")).toEqual(["Animals", "Colours", "History"]);
    expect(await titles(cookie, `?folder=${spanish}&q=col`)).toEqual(["Colours"]);
    expect((await api("/api/sets?folder=nope", { cookie })).status).toBe(400);
  });

  it("is changed by an edit that names it, kept by one that doesn't, cleared by null", async () => {
    const { cookie } = await signedIn("anna");
    const spanish = await addFolder(cookie, "Spanish");
    const other = await addFolder(cookie, "Other");
    const created = (await (
      await api("/api/sets", { method: "POST", cookie, json: { title: "Animals", terms, folderId: spanish } })
    ).json()) as { id: number; folderId: number };
    expect(created.folderId).toBe(spanish);
    const patch = async (extra: object) =>
      (
        (await (
          await api(`/api/sets/${created.id}`, { method: "PATCH", cookie, json: { title: "Animals", terms, ...extra } })
        ).json()) as { folderId: number | null }
      ).folderId;
    expect(await patch({ folderId: other })).toBe(other);
    expect(await patch({})).toBe(other);
    expect(await patch({ folderId: null })).toBeNull();
  });

  it("must be one of mine", async () => {
    const { cookie } = await signedIn("anna");
    const ben = await signedIn("ben");
    const bens = await addFolder(ben.cookie, "Ben's");
    const refused = { error: "validation", fields: { folderId: "invalid_value" } };

    const res = await api("/api/sets", { method: "POST", cookie, json: { title: "Animals", terms, folderId: bens } });
    expect(await res.json()).toEqual(refused);
    const { id } = (await (
      await api("/api/sets", { method: "POST", cookie, json: { title: "Animals", terms } })
    ).json()) as { id: number };
    const patched = await api(`/api/sets/${id}`, {
      method: "PATCH",
      cookie,
      json: { title: "Animals", terms, folderId: bens },
    });
    expect(await patched.json()).toEqual(refused);
    expect(await titles(ben.cookie, `?folder=${bens}`)).toEqual([]);
  });
});
