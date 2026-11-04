// The study session's report to the statistics (src/lib/studyTime.ts):
// active time and the counters of the modes without per-answer requests.
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockApi } from "../test/server";
import { useStudyActivity } from "./studyTime";

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
