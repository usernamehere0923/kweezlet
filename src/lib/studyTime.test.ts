// The study session's report to the statistics (src/lib/studyTime.ts):
// active time and the counters of the modes without per-answer requests.
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockApi } from "../test/server";
import { setFlushOwner, useStudyActivity } from "./studyTime";

function beacons(calls: { path: string; body: unknown }[]) {
  return calls
    .filter((call) => call.path === "/api/study/activity")
    .map((call) => call.body as Record<string, unknown>);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("useStudyActivity", () => {
  it("a flush sends the time and the counters with the set and mode", async () => {
    vi.useFakeTimers();
    const { calls } = mockApi({ "POST /api/study/activity": () => ({ json: { ok: true } }) });
    const { result, unmount } = renderHook(() => useStudyActivity({ active: true, setId: 7, mode: "flashcards" }));

    act(() => result.current.record({ cards: 3, learned: 1 }));
    await act(async () => {
      vi.advanceTimersByTime(31_000);
    });

    expect(beacons(calls)).toEqual([
      {
        day: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        seconds: 30,
        cards: 3,
        correct: 0,
        wrong: 0,
        learned: 1,
        setId: 7,
        mode: "flashcards",
        id: expect.stringMatching(/^[0-9a-f]{32}$/),
      },
    ]);
    unmount();
  });

  it("the clock stops after a minute without input", async () => {
    vi.useFakeTimers();
    const { calls } = mockApi({ "POST /api/study/activity": () => ({ json: { ok: true } }) });
    const { unmount } = renderHook(() => useStudyActivity({ active: true, mode: "learn" }));

    // Two minutes at the desk with nothing touched: the first idle minute
    // counts (the session just started), then the clock stops.
    await act(async () => {
      vi.advanceTimersByTime(121_000);
    });

    const sent = beacons(calls);
    expect(sent.map((body) => body.seconds)).toEqual([30, 30]);
    unmount();
  });

  it("the last counters leave with the page", async () => {
    vi.useFakeTimers();
    const { calls } = mockApi({ "POST /api/study/activity": () => ({ json: { ok: true } }) });
    const { result, unmount } = renderHook(() => useStudyActivity({ active: true, setId: 3, mode: "match" }));

    act(() => result.current.record({ cards: 6 }));
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(calls).toHaveLength(0);

    await act(async () => {
      unmount();
    });
    expect(beacons(calls)[0]).toMatchObject({ cards: 6, seconds: 10, setId: 3, mode: "match" });
  });

  it("a session that never started sends nothing", async () => {
    vi.useFakeTimers();
    const { calls } = mockApi({ "POST /api/study/activity": () => ({ json: { ok: true } }) });
    const { unmount } = renderHook(() => useStudyActivity({ active: false, mode: "learn" }));

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    await act(async () => {
      unmount();
    });
    expect(calls).toHaveLength(0);
  });

  it("a failed flush keeps the counts for the next one", async () => {
    vi.useFakeTimers();
    let up = false;
    const { calls } = mockApi({
      "POST /api/study/activity": () => {
        if (!up) {
          up = true;
          return { status: 500, json: {} };
        }
        return { json: { ok: true } };
      },
    });
    const { unmount } = renderHook(() => useStudyActivity({ active: true, mode: "learn" }));

    await act(async () => {
      vi.advanceTimersByTime(31_000);
    });
    await act(async () => {
      vi.advanceTimersByTime(31_000);
    });

    // The failed flush goes again as it was (same id: the worker counts it
    // once even if only its answer got lost), then the new one.
    const sent = beacons(calls);
    expect(sent.map((body) => body.seconds)).toEqual([30, 30, 30]);
    expect(sent[1].id).toBe(sent[0].id);
    expect(sent[2].id).not.toBe(sent[0].id);
    unmount();
  });

  it("a waiting flush goes out only for the user it was counted for", async () => {
    vi.useFakeTimers();
    let up = false;
    const { calls } = mockApi({
      "POST /api/study/activity": () => {
        if (!up) {
          up = true;
          return { status: 500, json: {} };
        }
        return { json: { ok: true } };
      },
    });
    // Anna studies on a shared iPad; her last flush fails.
    setFlushOwner("anna");
    const anna = renderHook(() => useStudyActivity({ active: true, setId: 3, mode: "match" }));
    act(() => anna.result.current.record({ cards: 6 }));
    await act(async () => {
      anna.unmount();
    });
    expect(beacons(calls)).toHaveLength(1);

    // She logs out (no reload), Ben logs in and studies: her flush stays put.
    setFlushOwner(null);
    setFlushOwner("ben");
    const ben = renderHook(() => useStudyActivity({ active: true, mode: "learn" }));
    await act(async () => {
      vi.advanceTimersByTime(31_000);
    });
    expect(beacons(calls).filter((body) => body.cards === 6)).toHaveLength(1);
    ben.unmount();

    // Anna back: it goes out for her.
    setFlushOwner("anna");
    const again = renderHook(() => useStudyActivity({ active: false, mode: "learn" }));
    await act(async () => {});
    expect(beacons(calls).filter((body) => body.cards === 6)).toHaveLength(2);
    again.unmount();
  });

  it("a flush hit by an expired session (401) waits for the next login", async () => {
    vi.useFakeTimers();
    let loggedIn = false;
    const { calls } = mockApi({
      "POST /api/study/activity": () => (loggedIn ? { json: { ok: true } } : { status: 401, json: {} }),
    });
    setFlushOwner("anna");
    const page = renderHook(() => useStudyActivity({ active: true, mode: "flashcards" }));
    act(() => page.result.current.record({ cards: 5 }));
    await act(async () => {
      page.unmount();
    });
    setFlushOwner(null);

    loggedIn = true;
    setFlushOwner("anna");
    const next = renderHook(() => useStudyActivity({ active: false, mode: "learn" }));
    await act(async () => {});
    const sent = beacons(calls);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(sent[0]);
    next.unmount();
  });

  it("a request that hangs times out instead of holding up every later flush", async () => {
    vi.useFakeTimers();
    let first = true;
    const { calls } = mockApi({
      "POST /api/study/activity": () => {
        if (first) {
          first = false;
          return new Promise(() => {}); // never answers
        }
        return { json: { ok: true } };
      },
    });
    const { result, unmount } = renderHook(() => useStudyActivity({ active: true, mode: "flashcards" }));
    act(() => result.current.record({ cards: 2 }));
    // Async: answers (and the timeout's abort) land between the ticks, as in a browser.
    await act(() => vi.advanceTimersByTimeAsync(31_000));
    act(() => result.current.record({ cards: 3 }));
    await act(() => vi.advanceTimersByTimeAsync(30_000));

    // The hung one went again (same id) and the newer one followed.
    const sent = beacons(calls);
    expect(sent[1]).toEqual(sent[0]);
    expect(sent.slice(2)).toEqual([expect.objectContaining({ cards: 3 })]);
    unmount();
  });

  it("one flush that keeps failing doesn't hold up the newer ones", async () => {
    vi.useFakeTimers();
    const { calls } = mockApi({
      "POST /api/study/activity": (body) => ((body as { cards: number }).cards === 1 ? { status: 500 } : { json: {} }),
    });
    const { result, unmount } = renderHook(() => useStudyActivity({ active: true, mode: "flashcards" }));
    act(() => result.current.record({ cards: 1 }));
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    act(() => result.current.record({ cards: 2 }));
    // The failing one moved behind the new one: the next turn is the new one's.
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(beacons(calls).map((body) => body.cards)).toContain(2);
    unmount();
  });

  it("a refused flush (4xx) is dropped, not resent forever", async () => {
    vi.useFakeTimers();
    const { calls } = mockApi({ "POST /api/study/activity": () => ({ status: 400, json: {} }) });
    const { unmount } = renderHook(() => useStudyActivity({ active: true, mode: "learn" }));

    await act(async () => {
      vi.advanceTimersByTime(31_000);
    });
    await act(async () => {
      vi.advanceTimersByTime(31_000);
    });
    // Two flushes, each sent once.
    const sent = beacons(calls);
    expect(sent).toHaveLength(2);
    expect(sent[1].id).not.toBe(sent[0].id);
    unmount();
  });

  it("a retry keeps the day and the set it was made for", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 11, 23, 59, 20));
    let up = false;
    const { calls } = mockApi({
      "POST /api/study/activity": () => {
        if (!up) {
          up = true;
          return { status: 500, json: {} };
        }
        return { json: { ok: true } };
      },
    });
    const { rerender, unmount } = renderHook(
      (props: { setId: number }) => useStudyActivity({ active: true, setId: props.setId, mode: "flashcards" }),
      { initialProps: { setId: 1 } },
    );

    // 23:59:51, set 1: fails. Then the page switches to set 2 and midnight passes.
    await act(async () => {
      vi.advanceTimersByTime(31_000);
    });
    rerender({ setId: 2 });
    await act(async () => {
      vi.advanceTimersByTime(31_000);
    });

    const [failed, retry, next] = beacons(calls);
    expect(failed).toMatchObject({ day: "2026-10-11", setId: 1 });
    expect(retry).toEqual(failed);
    expect(next).toMatchObject({ day: "2026-10-12", setId: 2 });
    unmount();
  });

  it("a flush that fails while the tab hides is retried when it comes back", async () => {
    vi.useFakeTimers();
    let up = false;
    const { calls } = mockApi({
      "POST /api/study/activity": () => {
        if (!up) {
          up = true;
          return { status: 500, json: {} };
        }
        return { json: { ok: true } };
      },
    });
    const { result, unmount } = renderHook(() => useStudyActivity({ active: true, mode: "flashcards" }));

    act(() => result.current.record({ cards: 4 }));
    // iPhone: app switch, no signal at that moment.
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await act(async () => {
      vi.advanceTimersByTime(31_000);
    });

    const sent = beacons(calls);
    expect(sent[0]).toMatchObject({ cards: 4 });
    expect(sent[1]).toEqual(sent[0]);
    unmount();
  });

  it("a flush that fails as the page goes is sent by the next study page", async () => {
    vi.useFakeTimers();
    let up = false;
    const { calls } = mockApi({
      "POST /api/study/activity": () => {
        if (!up) {
          up = true;
          return { status: 500, json: {} };
        }
        return { json: { ok: true } };
      },
    });
    const first = renderHook(() => useStudyActivity({ active: true, setId: 3, mode: "match" }));
    act(() => first.result.current.record({ cards: 6 }));
    await act(async () => {
      first.unmount();
    });
    const second = renderHook(() => useStudyActivity({ active: false, setId: 4, mode: "learn" }));
    await act(async () => {});

    const sent = beacons(calls);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(sent[0]);
    expect(sent[1]).toMatchObject({ cards: 6, setId: 3, mode: "match" });
    second.unmount();
  });

  it("a session that ends (round over) sends its counts at once", async () => {
    vi.useFakeTimers();
    const { calls } = mockApi({ "POST /api/study/activity": () => ({ json: { ok: true } }) });
    const { result, rerender, unmount } = renderHook(
      (props: { active: boolean }) => useStudyActivity({ active: props.active, setId: 3, mode: "match" }),
      { initialProps: { active: true } },
    );

    act(() => result.current.record({ cards: 6 }));
    // "Play again": the next round has not started yet.
    await act(async () => {
      rerender({ active: false });
    });
    expect(beacons(calls)).toEqual([expect.objectContaining({ cards: 6, setId: 3, mode: "match" })]);
    unmount();
  });

  it("never builds a flush above the worker's limits", async () => {
    vi.useFakeTimers();
    let online = false;
    const { calls } = mockApi({
      "POST /api/study/activity": () => (online ? { json: { ok: true } } : { status: 500, json: {} }),
    });
    const { result, unmount } = renderHook(() => useStudyActivity({ active: true, mode: "flashcards" }));

    // Offline: the first flush fails; the later ones wait behind it and pile
    // up into one, but only up to the worker's limit.
    for (let i = 0; i < 4; i++) {
      act(() => result.current.record({ cards: 4000 }));
      await act(async () => {
        vi.advanceTimersByTime(30_000);
      });
    }
    online = true;
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    const sent = beacons(calls);
    expect(sent.every((body) => (body.cards as number) <= 10_000)).toBe(true);
    // Every flush counted once: all 16'000 cards arrive, none twice.
    const counted = new Map(sent.map((body) => [body.id, body.cards as number]));
    expect([...counted.values()].reduce((sum, cards) => sum + cards, 0)).toBe(16_000);
    expect(counted.size).toBeGreaterThan(2);
    unmount();
  });

  it("counters recorded before the session starts leave with the page", async () => {
    vi.useFakeTimers();
    const { calls } = mockApi({ "POST /api/study/activity": () => ({ json: { ok: true } }) });
    const { result, unmount } = renderHook(() => useStudyActivity({ active: false, setId: 2, mode: "flashcards" }));

    act(() => result.current.record({ cards: 2 }));
    await act(async () => {
      unmount();
    });
    expect(beacons(calls)[0]).toMatchObject({ cards: 2, setId: 2, mode: "flashcards" });
  });

  it("a set id that isn't one sends no set context", async () => {
    vi.useFakeTimers();
    const { calls } = mockApi({ "POST /api/study/activity": () => ({ json: { ok: true } }) });
    const { unmount } = renderHook(() => useStudyActivity({ active: true, setId: Number("not-a-set"), mode: "learn" }));

    await act(async () => {
      vi.advanceTimersByTime(31_000);
    });
    const body = beacons(calls)[0];
    expect(body).not.toHaveProperty("setId");
    expect(body).not.toHaveProperty("mode");
    unmount();
  });
});
