import { afterEach, describe, expect, test, vi } from "vitest";
import { callZai, ZAI_TIMEOUT_MS, ZAI_URL, ZaiError, type ZaiMessage } from "../worker/ai/zai";

const MESSAGES: ZaiMessage[] = [{ role: "user", content: "hello" }];

/** Stubs the global fetch the z.ai client uses, and records the request. */
function stubFetch(answers: { status: number; body?: unknown; throws?: boolean }[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const answer = answers.shift();
    if (!answer) throw new Error("no stubbed answer left");
    if (answer.throws) throw new TypeError("network down");
    return new Response(JSON.stringify(answer.body), {
      status: answer.status,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("callZai", () => {
  test("posts the model and reads the answer and its usage", async () => {
    const { calls } = stubFetch([
      {
        status: 200,
        body: {
          choices: [{ message: { role: "assistant", content: '{"cards":[]}', reasoning_content: "thinking aloud" } }],
          usage: { prompt_tokens: 1000, completion_tokens: 500, prompt_tokens_details: { cached_tokens: 200 } },
        },
      },
    ]);
    const result = await callZai("key-123", { messages: MESSAGES, maxTokens: 24000 });
    expect(result.content).toBe('{"cards":[]}');
    expect(result.usage).toEqual({ promptTokens: 1000, cachedTokens: 200, completionTokens: 500 });
    expect(result.costNanos).toBe(800 * 150 + 200 * 30 + 500 * 500);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(ZAI_URL);
    const init = calls[0]!.init;
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer key-123");
    const body = JSON.parse(String(init.body)) as { model: string; stream: boolean; max_tokens: number };
    expect(body.model).toBe("glm-5.3-flash");
    expect(body.stream).toBe(false);
    expect(body.max_tokens).toBe(24000);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  test("costs a call with no usage at zero", async () => {
    stubFetch([{ status: 200, body: { choices: [{ message: { content: "x" } }] } }]);
    const result = await callZai("key", { messages: MESSAGES, maxTokens: 10 });
    expect(result.usage).toEqual({ promptTokens: 0, cachedTokens: 0, completionTokens: 0 });
    expect(result.costNanos).toBe(0);
  });

  test("429 is ai_busy: the AI is busy, try again in a minute", async () => {
    stubFetch([{ status: 429, body: { error: { code: 1302, message: "Rate limit reached for requests" } } }]);
    const err = await callZai("key", { messages: MESSAGES, maxTokens: 10 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ZaiError);
    expect((err as ZaiError).kind).toBe("ai_busy");
    expect((err as ZaiError).message).toBe("Rate limit reached for requests");
    expect((err as ZaiError).costNanos).toBe(0);
  });

  test("401 and 403 are ai_key, 400 is ai_input", async () => {
    stubFetch([{ status: 401, body: { error: { code: 1000, message: "Authentication Failed" } } }]);
    const auth = (await callZai("key", { messages: MESSAGES, maxTokens: 10 }).catch((e: unknown) => e)) as ZaiError;
    expect(auth.kind).toBe("ai_key");
    expect(auth.message).toBe("Authentication Failed");

    stubFetch([{ status: 400, body: { error: { code: 1214, message: "Parameter is invalid" } } }]);
    const bad = (await callZai("key", { messages: MESSAGES, maxTokens: 10 }).catch((e: unknown) => e)) as ZaiError;
    expect(bad.kind).toBe("ai_input");
    expect(bad.message).toBe("Parameter is invalid");
  });

  test("500 without a readable body still says what happened", async () => {
    stubFetch([{ status: 500, body: "not json" }]);
    const err = (await callZai("key", { messages: MESSAGES, maxTokens: 10 }).catch((e: unknown) => e)) as ZaiError;
    expect(err.kind).toBe("ai_server");
    expect(err.message).toBe("z.ai answered 500");
    expect(err.costNanos).toBe(0);
  });

  test("a failed call still carries its cost when z.ai reports usage", async () => {
    stubFetch([
      {
        status: 429,
        body: {
          error: { code: 1308, message: "Usage limit reached" },
          usage: { prompt_tokens: 100, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 0 } },
        },
      },
    ]);
    const err = (await callZai("key", { messages: MESSAGES, maxTokens: 10 }).catch((e: unknown) => e)) as ZaiError;
    expect(err.kind).toBe("ai_busy");
    expect(err.costNanos).toBe(100 * 150 + 10 * 500);
    expect(err.usage).toEqual({ promptTokens: 100, cachedTokens: 0, completionTokens: 10 });
  });

  test("an answer without content is a server error", async () => {
    stubFetch([{ status: 200, body: { choices: [{ message: { content: "" } }] } }]);
    const err = (await callZai("key", { messages: MESSAGES, maxTokens: 10 }).catch((e: unknown) => e)) as ZaiError;
    expect(err.kind).toBe("ai_server");
    expect(err.message).toBe("z.ai answer had no content");
  });

  test("a timeout or network error is a server error", async () => {
    stubFetch([{ status: 0, throws: true }]);
    const err = (await callZai("key", { messages: MESSAGES, maxTokens: 10 }).catch((e: unknown) => e)) as ZaiError;
    expect(err.kind).toBe("ai_server");
    expect(err.message).toContain("network down");
  });

  test("without an API key nothing is sent", async () => {
    const { fetchMock } = stubFetch([]);
    const err = (await callZai(undefined, { messages: MESSAGES, maxTokens: 10 }).catch((e: unknown) => e)) as ZaiError;
    expect(err.kind).toBe("ai_key");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ZAI_TIMEOUT_MS).toBe(120_000);
  });
});
