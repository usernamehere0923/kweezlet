// The AI job flow: POST hands a draft to the user's AiRunner, its alarm calls
// z.ai (a fetch stub here) and writes cards and cost to D1. The alarm is set
// to "now", so the run starts by itself; tests wait for it to settle.
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeZai } from "../worker/ai/fake";
import { runJob, type AiJob, type AiRunner } from "../worker/ai/runner";
import { isLocalHost } from "../worker/ai";
import { addUser, api, signedIn } from "./helpers";

const PAGE_2 = "el perro — the dog\nel gato — the cat";
const MATERIAL = {
  sourceName: "Vokabeln.pdf",
  pages: [
    { n: 1, text: "Vokabeln Kapitel 2" },
    { n: 2, text: PAGE_2 },
  ],
};
const DOG = { term: "el perro", definition: "the dog", source: "el perro — the dog", page: 2 };
const CAT = { term: "el gato", definition: "the cat", source: "el gato — the cat", page: 2 };
const HORSE = { term: "el caballo", definition: "the horse", source: "", page: null };

type Answer = { status: number; body?: unknown; gate?: Promise<void> };

/** z.ai's answer in the output format, with usage. */
function answer(cards: unknown[], extra: Record<string, unknown> = {}): Answer {
  return reply(
    JSON.stringify({ kind: "vocabulary", title: "Animals", term_lang: "es", def_lang: "en", cards, ...extra }),
  );
}
function reply(content: string): Answer {
  return {
    status: 200,
    body: {
      choices: [{ message: { content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1000, completion_tokens: 200, prompt_tokens_details: { cached_tokens: 0 } },
    },
  };
}

/** Stubs z.ai; returns the request bodies it got. An answer with a gate waits for it. */
function stubZai(...answers: Answer[]) {
  const bodies: { messages: { role: string; content: unknown }[] }[] = [];
  const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    const next = answers.shift();
    if (!next) throw new Error("no stubbed z.ai answer left");
    await next.gate;
    return new Response(JSON.stringify(next.body ?? {}), { status: next.status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { bodies, fetchMock };
}

const runner = (userId: number) => env.AI_RUNNER.get(env.AI_RUNNER.idFromName(String(userId)));

async function post(cookie: string, path: string, json: unknown) {
  return api(path, { method: "POST", cookie, json });
}

async function createDraft(cookie: string, body: unknown = MATERIAL): Promise<number> {
  const res = await post(cookie, "/api/ai/drafts", body);
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: number }).id;
}

type Draft = Record<string, unknown> & { status: string; cards: Record<string, unknown>[] };

/** The draft once its run is over (the alarm runs by itself, a moment later). */
async function settled(cookie: string, id: number): Promise<Draft> {
  for (let i = 0; i < 100; i++) {
    const body = (await (await api(`/api/ai/drafts/${id}`, { cookie })).json()) as Draft;
    if (body.status !== "running") return body;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("the run never ended");
}

const usageRows = (userId: number) =>
  env.DB.prepare("SELECT action, model, calls, cost_nanos, draft_id FROM ai_usage WHERE user_id = ? ORDER BY id")
    .bind(userId)
    .all()
    .then((r) => r.results);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a run", () => {
  it("makes a ready draft: verified cards checked, the rest unchecked, named, costed", async () => {
    const { id: userId, cookie } = await signedIn("anna");
    const { bodies } = stubZai(answer([DOG, { ...CAT, source: "invented quote" }]));
    const id = await createDraft(cookie);

    const body = await settled(cookie, id);
    expect(body).toMatchObject({ status: "ready", title: "Animals", madeKind: "vocabulary", termLang: "es", added: 2 });
    expect(body.cards).toEqual([
      { ...DOG, verified: true, checked: true },
      { ...CAT, source: "invented quote", verified: false, checked: false },
    ]);
    expect(body.pages).toEqual([
      { n: 1, image: false },
      { n: 2, image: false },
    ]);
    expect(body.cost).toEqual({ nanos: 1000 * 150 + 200 * 500, tokens: 1200, durationMs: expect.any(Number) });
    // The page text went to z.ai, tagged with its number.
    expect(JSON.stringify(bodies[0]!.messages)).toContain(String.raw`<page n=\"2\">`);
    expect(await usageRows(userId)).toEqual([
      { action: "create", model: "glm-5.3-flash", calls: 1, cost_nanos: 250_000, draft_id: id },
    ]);
  });

  it("one at a time: a second run while one is going is 409 and leaves nothing behind", async () => {
    const { cookie } = await signedIn("anna");
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    stubZai({ ...answer([DOG]), gate });
    const first = await createDraft(cookie);

    const second = await post(cookie, "/api/ai/drafts", MATERIAL);
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: "ai_running" });
    release();
    await settled(cookie, first);
    const list = (await (await api("/api/ai/drafts", { cookie })).json()) as { drafts: { id: number }[] };
    expect(list.drafts.map((d) => d.id)).toEqual([first]);
  });

  it("an unreadable answer gets one repair retry, and both calls are paid for", async () => {
    const { id: userId, cookie } = await signedIn("anna");
    const { bodies } = stubZai(reply("Sorry, here: {not json"), answer([DOG]));
    const id = await createDraft(cookie);

    expect((await settled(cookie, id)).status).toBe("ready");
    expect(bodies).toHaveLength(2);
    expect(JSON.stringify(bodies[1]!.messages)).toContain("could not be read");
    expect(await usageRows(userId)).toMatchObject([{ calls: 2, cost_nanos: 500_000 }]);
  });

  it("a failed run says why, keeps what it cost, and a twice-unreadable answer fails", async () => {
    const { id: userId, cookie } = await signedIn("anna");
    stubZai({
      status: 429,
      body: {
        error: { code: "1113", message: "Insufficient balance" },
        usage: { prompt_tokens: 100, completion_tokens: 0 },
      },
    });
    const id = await createDraft(cookie);
    expect(await settled(cookie, id)).toMatchObject({ status: "failed", error: "ai_quota", cards: [] });
    expect(await usageRows(userId)).toMatchObject([{ calls: 1, cost_nanos: 100 * 150 }]);

    stubZai(reply("nope"), reply("still nope"));
    const again = await createDraft(cookie);
    expect(await settled(cookie, again)).toMatchObject({ status: "failed", error: "ai_server" });
  });

  it("an alarm retried after the z.ai call never calls again: the draft fails instead", async () => {
    const { id: userId } = await signedIn("anna");
    const { fetchMock } = stubZai();
    await env.DB.prepare("INSERT INTO ai_drafts (user_id, status, kind) VALUES (?, 'running', 'auto')")
      .bind(userId)
      .run();
    const job: AiJob = { userId, draftId: 1, action: "create", userLanguage: "en", fake: false, startedAt: Date.now() };
    await runInDurableObject(runner(userId), async (_instance, state) => {
      await state.storage.put("job", job);
      await state.storage.put("called", true);
      await state.storage.setAlarm(Date.now() + 60_000);
    });

    expect(await runDurableObjectAlarm(runner(userId))).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    const row = await env.DB.prepare("SELECT status, error FROM ai_drafts WHERE id = 1").first();
    expect(row).toEqual({ status: "failed", error: "ai_server" });
    // The lock is free again.
    await runInDurableObject(runner(userId), async (_instance, state) => {
      expect(await state.storage.get("job")).toBeUndefined();
    });
  });

  it("when D1 fails after z.ai answered, the alarm retry writes the stored result: one call, one cost row", async () => {
    const userId = await addUser("anna", "secret-pw");
    const { fetchMock } = stubZai(answer([DOG]));
    await env.DB.batch([
      env.DB.prepare("INSERT INTO ai_drafts (user_id, status, kind) VALUES (?, 'running', 'auto')").bind(userId),
      env.DB.prepare("INSERT INTO ai_draft_pages (user_id, draft_id, n, text) VALUES (?, 1, 2, ?)").bind(
        userId,
        PAGE_2,
      ),
    ]);
    const job: AiJob = { userId, draftId: 1, action: "create", userLanguage: "en", fake: false, startedAt: Date.now() };
    await runInDurableObject(runner(userId), async (instance, state) => {
      const db = (instance as unknown as { env: Env }).env.DB;
      const real = db.batch.bind(db);
      let batches = 0;
      // The first batch reads the draft; the second one writes the result and fails.
      const spy = vi.spyOn(db, "batch").mockImplementation(async (statements) => {
        if (++batches === 2) throw new Error("D1 is down");
        return real(statements);
      });
      await state.storage.put("job", job);
      await expect((instance as AiRunner).alarm()).rejects.toThrow("D1 is down");
      expect(await state.storage.get("end")).toBeDefined();
      spy.mockRestore();

      await (instance as AiRunner).alarm(); // the runtime's retry
      expect(await state.storage.get("job")).toBeUndefined();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await env.DB.prepare("SELECT status FROM ai_drafts WHERE id = 1").first()).toEqual({ status: "ready" });
    expect(await usageRows(userId)).toMatchObject([{ calls: 1, cost_nanos: 250_000 }]);
  });

  it("an alarm that died during the call fails the draft with the cost known so far", async () => {
    const userId = await addUser("anna", "secret-pw");
    const { fetchMock } = stubZai();
    await env.DB.prepare("INSERT INTO ai_drafts (user_id, status, kind) VALUES (?, 'running', 'auto')")
      .bind(userId)
      .run();
    const job: AiJob = { userId, draftId: 1, action: "create", userLanguage: "en", fake: false, startedAt: Date.now() };
    const spend = {
      calls: 1,
      usage: { promptTokens: 100, cachedTokens: 0, completionTokens: 0 },
      costNanos: 15_000,
      durationMs: 9,
    };
    await runInDurableObject(runner(userId), async (instance, state) => {
      await state.storage.put({ job, called: true, spend });
      await (instance as AiRunner).alarm();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await env.DB.prepare("SELECT status, error FROM ai_drafts WHERE id = 1").first()).toEqual({
      status: "failed",
      error: "ai_server",
    });
    expect(await usageRows(userId)).toMatchObject([{ calls: 1, cost_nanos: 15_000 }]);
  });

  it("a draft deleted during its run keeps its cost row, without the draft", async () => {
    const { id: userId, cookie } = await signedIn("anna");
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { fetchMock } = stubZai({ ...answer([DOG]), gate });
    const id = await createDraft(cookie);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect((await api(`/api/ai/drafts/${id}`, { method: "DELETE", cookie })).status).toBe(200);
    release();
    await vi.waitFor(async () => expect(await usageRows(userId)).toMatchObject([{ action: "create", draft_id: null }]));
  });
});

describe("more cards and regenerate", () => {
  it("More cards sends only the new pages and skips what the draft or its set already has", async () => {
    const { id: userId, cookie } = await signedIn("anna");
    const set = await post(cookie, "/api/sets", {
      title: "Zoo",
      terms: [{ term: "el caballo", definition: "the horse" }],
    });
    const setId = ((await set.json()) as { id: number }).id;
    stubZai(answer([DOG]));
    const id = await createDraft(cookie, { ...MATERIAL, setId });
    await settled(cookie, id);

    const { bodies } = stubZai(
      answer([
        { ...DOG, definition: "The dog!" },
        HORSE,
        { term: "el pez", definition: "the fish", source: "el pez", page: 3 },
      ]),
    );
    const res = await post(cookie, `/api/ai/drafts/${id}/more`, { pages: [{ n: 3, text: "el pez — the fish" }] });
    expect(res.status).toBe(202);

    const body = await settled(cookie, id);
    expect(body).toMatchObject({ status: "ready", added: 1, skipped: 2, title: "Animals" });
    expect(body.cards.map((card) => card.term)).toEqual(["el perro", "el pez"]);
    const sent = JSON.stringify(bodies[0]!.messages);
    expect(sent).toContain(String.raw`<page n=\"3\">`);
    expect(sent).not.toContain(String.raw`<page n=\"2\">`);
    expect(sent).toContain("el caballo — the horse"); // the set's terms are listed as existing
    expect((await usageRows(userId)).map((row) => row.action)).toEqual(["create", "more"]);
  });

  it("regenerate replaces the cards as the kind asked for", async () => {
    const { cookie } = await signedIn("anna");
    stubZai(answer([DOG, CAT]));
    const id = await createDraft(cookie);
    await settled(cookie, id);

    const { bodies } = stubZai(answer([HORSE], { kind: "terms", title: "Again" }));
    expect((await post(cookie, `/api/ai/drafts/${id}/regenerate`, { kind: "terms" })).status).toBe(202);
    const body = await settled(cookie, id);
    expect(body).toMatchObject({ kind: "terms", madeKind: "terms", title: "Again", added: 1 });
    expect(body.cards.map((card) => card.term)).toEqual(["el caballo"]);
    expect(JSON.stringify(bodies[0]!.messages)).toContain("<kind>terms</kind>");
  });

  it("nothing starts on a draft that is running, gone or someone else's", async () => {
    const { cookie } = await signedIn("anna");
    const { cookie: ben } = await signedIn("ben");
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    stubZai({ ...answer([DOG]), gate });
    const id = await createDraft(cookie);

    expect((await post(cookie, `/api/ai/drafts/${id}/regenerate`, { kind: "auto" })).status).toBe(409);
    expect((await post(cookie, `/api/ai/drafts/${id}/more`, MATERIAL)).status).toBe(409);
    expect((await api(`/api/ai/drafts/${id}`, { method: "PATCH", cookie, json: { title: "x" } })).status).toBe(409);
    expect((await post(cookie, `/api/ai/drafts/${id}/save`, { setId: null, title: "x" })).status).toBe(409);
    release();
    await settled(cookie, id);
    expect((await api(`/api/ai/drafts/${id}`, { cookie: ben })).status).toBe(404);
    expect((await post(ben, `/api/ai/drafts/${id}/regenerate`, { kind: "auto" })).status).toBe(404);
    expect((await post(ben, `/api/ai/drafts/${id}/more`, MATERIAL)).status).toBe(404);
    expect((await api(`/api/ai/drafts/${id}`, { method: "PATCH", cookie: ben, json: {} })).status).toBe(404);
    expect((await api(`/api/ai/drafts/${id}`, { method: "DELETE", cookie: ben })).status).toBe(404);
    expect((await post(ben, `/api/ai/drafts/${id}/save`, { setId: null, title: "x" })).status).toBe(404);
  });
});

describe("races and limits", () => {
  it("a refused run changes nothing: kind and pages stay as they were", async () => {
    const { cookie } = await signedIn("anna");
    stubZai(answer([DOG]));
    const ready = await createDraft(cookie);
    await settled(cookie, ready);
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    stubZai({ ...answer([CAT]), gate });
    const running = await createDraft(cookie);

    expect((await post(cookie, `/api/ai/drafts/${ready}/regenerate`, { kind: "questions" })).status).toBe(409);
    const more = await post(cookie, `/api/ai/drafts/${ready}/more`, { pages: [{ n: 2, text: "replaced" }] });
    expect(more.status).toBe(409);
    const page = await env.DB.prepare("SELECT text FROM ai_draft_pages WHERE draft_id = ? AND n = 2")
      .bind(ready)
      .first();
    expect(page).toEqual({ text: PAGE_2 });
    expect((await settled(cookie, ready)).kind).toBe("auto");
    release();
    await settled(cookie, running);
  });

  it("two saves at once write the cards once; the second finds no draft", async () => {
    const { cookie } = await signedIn("anna");
    const set = await post(cookie, "/api/sets", { title: "Zoo", terms: [{ term: "el pez", definition: "the fish" }] });
    const setId = ((await set.json()) as { id: number }).id;
    stubZai(answer([DOG]), answer([CAT]));
    const intoSet = await createDraft(cookie);
    await settled(cookie, intoSet);
    const intoNew = await createDraft(cookie);
    await settled(cookie, intoNew);

    const saveTwice = (id: number, json: unknown) =>
      Promise.all([post(cookie, `/api/ai/drafts/${id}/save`, json), post(cookie, `/api/ai/drafts/${id}/save`, json)]);
    expect((await saveTwice(intoSet, { setId })).map((r) => r.status).sort()).toEqual([200, 404]);
    expect((await saveTwice(intoNew, { setId: null, title: "New" })).map((r) => r.status).sort()).toEqual([200, 404]);

    const terms = await env.DB.prepare("SELECT term FROM terms ORDER BY id").all();
    expect(terms.results.map((row) => row.term)).toEqual(["el pez", "el perro", "el gato"]);
    const sets = await env.DB.prepare("SELECT title FROM sets ORDER BY id").all();
    expect(sets.results.map((row) => row.title)).toEqual(["Zoo", "New"]);
  });

  it("a draft holds at most 500 cards: More cards fills it up, then refuses", async () => {
    const { cookie } = await signedIn("anna");
    stubZai(answer([DOG]));
    const id = await createDraft(cookie);
    await settled(cookie, id);
    const filler = Array.from({ length: 499 }, (_, i) => ({ term: `t${i}`, definition: `d${i}` }));
    await env.DB.prepare("UPDATE ai_drafts SET cards_json = ? WHERE id = ?").bind(JSON.stringify(filler), id).run();

    stubZai(answer([DOG, CAT]));
    expect((await post(cookie, `/api/ai/drafts/${id}/more`, { pages: [{ n: 3, text: "x" }] })).status).toBe(202);
    const body = await settled(cookie, id);
    expect(body).toMatchObject({ added: 1, skipped: 0 });
    expect(body.cards).toHaveLength(500);

    const full = await post(cookie, `/api/ai/drafts/${id}/more`, { pages: [{ n: 4, text: "y" }] });
    expect(await full.json()).toMatchObject({ fields: { cards: "too_big" } });
  });

  it("a start that fails on D1 stores no job: the lock stays free", async () => {
    const userId = await addUser("anna", "secret-pw");
    const job: AiJob = { userId, draftId: 1, action: "create", userLanguage: "en", fake: false, startedAt: Date.now() };
    await runInDurableObject(runner(userId), async (instance, state) => {
      const db = (instance as unknown as { env: Env }).env.DB;
      const batch = vi.spyOn(db, "batch").mockRejectedValueOnce(new Error("D1 is down"));
      await expect((instance as AiRunner).start(job)).rejects.toThrow("D1 is down");
      expect(await state.storage.get("job")).toBeUndefined();
      expect(await state.storage.getAlarm()).toBeNull();
      batch.mockRestore();
    });
  });
});

describe("the review screen", () => {
  it("edits save as you go; saving keeps the checked cards in a new set and drops the draft", async () => {
    const { cookie } = await signedIn("anna");
    stubZai(answer([DOG, { ...CAT, source: "nowhere" }, HORSE]));
    const id = await createDraft(cookie);
    const { cards } = await settled(cookie, id);

    const edited = [{ ...cards[0], definition: "the doggy" }, { ...cards[1], checked: true }, cards[2]];
    const patch = await api(`/api/ai/drafts/${id}`, {
      method: "PATCH",
      cookie,
      json: { cards: edited, title: "Tiere", defLang: null },
    });
    expect(patch.status).toBe(200);
    expect(await settled(cookie, id)).toMatchObject({ title: "Tiere", defLang: null, termLang: "es" });

    const saved = await post(cookie, `/api/ai/drafts/${id}/save`, { setId: null, title: "Tiere", termLang: "es" });
    expect(saved.status).toBe(200);
    const { setId } = (await saved.json()) as { setId: number };
    const set = (await (await api(`/api/sets/${setId}`, { cookie })).json()) as {
      title: string;
      terms: { term: string; definition: string }[];
    };
    expect(set.title).toBe("Tiere");
    expect(set.terms.map((t) => [t.term, t.definition])).toEqual([
      ["el perro", "the doggy"],
      ["el gato", "the cat"],
    ]);
    expect((await api(`/api/ai/drafts/${id}`, { cookie })).status).toBe(404);
  });

  it("saving into an existing set adds the cards after its last term", async () => {
    const { cookie } = await signedIn("anna");
    const set = await post(cookie, "/api/sets", { title: "Zoo", terms: [{ term: "el pez", definition: "the fish" }] });
    const setId = ((await set.json()) as { id: number }).id;
    stubZai(answer([DOG]));
    const id = await createDraft(cookie);
    await settled(cookie, id);

    expect((await post(cookie, `/api/ai/drafts/${id}/save`, { setId })).status).toBe(200);
    const after = (await (await api(`/api/sets/${setId}`, { cookie })).json()) as { terms: { term: string }[] };
    expect(after.terms.map((t) => t.term)).toEqual(["el pez", "el perro"]);
  });

  it("saving needs a checked, complete card, a title for a new set, and a set of mine", async () => {
    const { cookie } = await signedIn("anna");
    const { cookie: ben } = await signedIn("ben");
    const bensSet = await post(ben, "/api/sets", { title: "Ben", terms: [{ term: "a", definition: "b" }] });
    const bensSetId = ((await bensSet.json()) as { id: number }).id;
    stubZai(answer([{ ...CAT, source: "nowhere" }]));
    const id = await createDraft(cookie);
    const { cards } = await settled(cookie, id);

    const save = (json: unknown) => post(cookie, `/api/ai/drafts/${id}/save`, json).then((r) => r.json());
    expect(await save({ setId: null, title: "x" })).toMatchObject({ fields: { cards: "too_small" } });
    await api(`/api/ai/drafts/${id}`, {
      method: "PATCH",
      cookie,
      json: { cards: [{ ...cards[0], term: "", checked: true }] },
    });
    expect(await save({ setId: null, title: "x" })).toMatchObject({ fields: { cards: "invalid_value" } });
    await api(`/api/ai/drafts/${id}`, { method: "PATCH", cookie, json: { cards: [{ ...cards[0], checked: true }] } });
    expect(await save({ setId: null })).toMatchObject({ fields: { title: "too_small" } });
    expect(await save({ setId: bensSetId })).toMatchObject({ fields: { setId: "invalid_value" } });
    const patch = await api(`/api/ai/drafts/${id}`, { method: "PATCH", cookie, json: { setId: bensSetId } });
    expect(await patch.json()).toMatchObject({ fields: { setId: "invalid_value" } });
  });

  it("drafts list newest first; a dead run is failed and month-old drafts go", async () => {
    const { id: userId, cookie } = await signedIn("anna");
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO ai_drafts (user_id, status, kind, title, updated_at) VALUES (?, 'running', 'auto', 'stuck', unixepoch() - 3600)",
      ).bind(userId),
      env.DB.prepare(
        "INSERT INTO ai_drafts (user_id, status, kind, title, updated_at) VALUES (?, 'ready', 'auto', 'old', unixepoch() - 31 * 86400)",
      ).bind(userId),
      env.DB.prepare("INSERT INTO ai_drafts (user_id, status, kind, title) VALUES (?, 'ready', 'auto', 'fresh')").bind(
        userId,
      ),
    ]);
    const { drafts } = (await (await api("/api/ai/drafts", { cookie })).json()) as {
      drafts: { title: string; status: string; cardCount: number }[];
    };
    expect(drafts.map((d) => [d.title, d.status, d.cardCount])).toEqual([
      ["fresh", "ready", 0],
      ["stuck", "failed", 0],
    ]);
  });
});

describe("what a run may get", () => {
  it("at most 6 image pages, unique page numbers, a target set of mine", async () => {
    const { cookie } = await signedIn("anna");
    const image = "data:image/jpeg;base64,AAAA";
    const seven = Array.from({ length: 7 }, (_, i) => ({ n: i + 1, image }));
    const res = (json: unknown) => post(cookie, "/api/ai/drafts", json).then(async (r) => [r.status, await r.json()]);
    expect(await res({ pages: seven })).toEqual([400, { error: "validation", fields: { pages: "too_big" } }]);
    expect(
      await res({
        pages: [
          { n: 1, text: "a" },
          { n: 1, text: "b" },
        ],
      }),
    ).toEqual([400, { error: "validation", fields: { pages: "invalid_value" } }]);
    expect(await res({ pages: [{ n: 1, text: "a" }], setId: 99 })).toEqual([
      400,
      { error: "validation", fields: { setId: "invalid_value" } },
    ]);
  });

  it("the monthly cap stops a normal account, not an admin; last month does not count", async () => {
    const { id: admin, cookie: adminCookie } = await signedIn("anna"); // the first account is admin
    const { id: student, cookie } = await signedIn("ben");
    /** Spend at `now` moved by the two SQLite modifiers. */
    const spend = (userId: number, nanos: number, ...when: [string, string]) =>
      env.DB.prepare(
        `INSERT INTO ai_usage (user_id, created_at, action, model, cost_nanos)
         VALUES (?, CAST(strftime('%s', 'now', ?, ?) AS INTEGER), 'create', 'glm-5.3-flash', ?)`,
      )
        .bind(userId, ...when, nanos)
        .run();
    const NOW: [string, string] = ["+0 seconds", "+0 seconds"];
    await spend(student, 5_000_000_000, "start of month", "-1 second");
    stubZai(answer([DOG]), answer([DOG]));
    const id = await createDraft(cookie); // last month's $5 does not count
    await settled(cookie, id);

    await spend(student, 2_000_000_000, ...NOW);
    const blocked = await post(cookie, "/api/ai/drafts", MATERIAL);
    expect(blocked.status).toBe(402);
    expect(await blocked.json()).toEqual({ error: "ai_cap", capNanos: 2_000_000_000 });
    expect((await post(cookie, `/api/ai/drafts/${id}/regenerate`, { kind: "auto" })).status).toBe(402);
    expect((await post(cookie, `/api/ai/drafts/${id}/more`, MATERIAL)).status).toBe(402);

    await spend(admin, 9_000_000_000, ...NOW);
    const adminDraft = await createDraft(adminCookie);
    await settled(adminCookie, adminDraft);

    const usage = (await (await api("/api/ai/usage", { cookie })).json()) as Record<string, unknown>;
    // This month: the $2 plus one run (250,000 nanos); all time adds last month's $5.
    expect(usage).toMatchObject({ monthNanos: 2_000_250_000, totalNanos: 7_000_250_000, capNanos: 2_000_000_000 });
    expect((usage.recent as unknown[]).length).toBe(3);
    const adminUsage = (await (await api("/api/ai/usage", { cookie: adminCookie })).json()) as Record<string, unknown>;
    expect(adminUsage.capNanos).toBeNull();
  });
});

describe("the stand-in AI (ZAI_FAKE, local dev only)", () => {
  it("turns pairs and sentences into cards that pass the real pipeline", async () => {
    const userId = await addUser("anna", "secret-pw");
    await env.DB.batch([
      env.DB.prepare("INSERT INTO ai_drafts (user_id, status, kind) VALUES (?, 'running', 'auto')").bind(userId),
      env.DB.prepare("INSERT INTO ai_draft_pages (user_id, draft_id, n, text) VALUES (?, 1, 1, ?)").bind(
        userId,
        "el perro — the dog\nBern ist die Hauptstadt der Schweiz. Kurz.",
      ),
      env.DB.prepare(
        "INSERT INTO ai_draft_pages (user_id, draft_id, n, image) VALUES (?, 1, 2, 'data:image/jpeg;base64,AA')",
      ).bind(userId),
    ]);
    const job: AiJob = { userId, draftId: 1, action: "create", userLanguage: "en", fake: true, startedAt: Date.now() };
    await runJob(env.DB, job, (call) => fakeZai(call, 0));

    const row = await env.DB.prepare("SELECT status, made_kind, cards_json FROM ai_drafts WHERE id = 1").first<{
      status: string;
      made_kind: string;
      cards_json: string;
    }>();
    expect(row).toMatchObject({ status: "ready", made_kind: "vocabulary" });
    const cards = JSON.parse(row!.cards_json) as { term: string; verified: boolean }[];
    expect(cards.map((card) => [card.term, card.verified])).toEqual([
      ["el perro", true],
      ["Photo page 2", false],
      ["Bern ist die …", true],
    ]);
    expect(await usageRows(userId)).toMatchObject([{ model: "fake", calls: 1 }]);
  });

  it("is only ever on for the dev server's hosts", () => {
    for (const host of ["localhost", "127.0.0.1", "192.168.1.20", "10.0.0.5", "172.20.1.1", "macbook.local", "[::1]"]) {
      expect(isLocalHost(host)).toBe(true);
    }
    for (const host of ["kweezlet.workers.dev", "kweezlet.test", "172.32.0.1", "8.8.8.8"]) {
      expect(isLocalHost(host)).toBe(false);
    }
  });
});
