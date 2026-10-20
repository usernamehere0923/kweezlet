import { act, renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { mockSpeech } from "../test/speech";
import { speak, speechAvailable, stopSpeaking, useSpeech } from "./speech";

describe("speak", () => {
  test("says the text in its language and prefers a matching voice", () => {
    const { spoken, synthesis } = mockSpeech([{ lang: "de-DE" }, { lang: "en-US" }]);
    speak({ text: "el gato", lang: "de" });
    expect(spoken[0].text).toBe("el gato");
    expect(spoken[0].lang).toBe("de");
    expect(spoken[0].voice).toEqual({ lang: "de-DE" });
    expect(synthesis.speak).toHaveBeenCalledWith(spoken[0]);
  });

  test("without a language the browser picks the voice", () => {
    const { spoken } = mockSpeech([{ lang: "de-DE" }]);
    speak({ text: "el gato", lang: null });
    expect(spoken[0].lang).toBe("");
    expect(spoken[0].voice).toBeNull();
  });

  test("a new text cuts the old one off", () => {
    const { synthesis } = mockSpeech();
    speak({ text: "one", lang: null });
    speak({ text: "two", lang: null });
    expect(synthesis.cancel).toHaveBeenCalledTimes(2);
  });

  test("stopSpeaking falls silent", () => {
    const { synthesis } = mockSpeech();
    stopSpeaking();
    expect(synthesis.cancel).toHaveBeenCalledOnce();
  });

  test("without Web Speech nothing happens and nothing breaks", () => {
    vi.stubGlobal("speechSynthesis", undefined);
    expect(speechAvailable()).toBe(false);
    expect(speak({ text: "el gato", lang: "es" })).toBeNull();
    expect(() => stopSpeaking()).not.toThrow();
  });
});

describe("useSpeech", () => {
  test("knows whether it is still talking", () => {
    const { spoken, synthesis } = mockSpeech();
    const { result } = renderHook(() => useSpeech());

    act(() => result.current.say({ text: "el gato", lang: "es" }));
    expect(result.current.speaking).toBe(true);

    // The voice ends: back to not speaking.
    act(() => spoken[0].onend?.());
    expect(result.current.speaking).toBe(false);

    act(() => result.current.say({ text: "the cat", lang: "en" }));
    expect(result.current.speaking).toBe(true);
    act(() => result.current.stop());
    expect(result.current.speaking).toBe(false);
    expect(synthesis.cancel).toHaveBeenCalled();
  });

  test("a cut-off utterance does not clear the one talking now", () => {
    const { spoken } = mockSpeech();
    const { result } = renderHook(() => useSpeech());

    act(() => result.current.say({ text: "one", lang: null }));
    act(() => result.current.say({ text: "two", lang: null }));
    // The first one dies because the second took over: "two" keeps talking.
    act(() => spoken[0].onend?.());
    expect(result.current.speaking).toBe(true);
    act(() => spoken[1].onend?.());
    expect(result.current.speaking).toBe(false);
  });

  test("leaving the screen stops the voice", () => {
    const { synthesis } = mockSpeech();
    const { result, unmount } = renderHook(() => useSpeech());
    act(() => result.current.say({ text: "el gato", lang: "es" }));
    unmount();
    expect(synthesis.cancel).toHaveBeenCalled();
  });

  test("a silent speaker leaving does not cut off another one", () => {
    const { spoken, synthesis } = mockSpeech();
    const talker = renderHook(() => useSpeech());
    const silent = renderHook(() => useSpeech());
    act(() => talker.result.current.say({ text: "el gato", lang: "es" }));
    synthesis.cancel.mockClear();
    silent.unmount();
    expect(synthesis.cancel).not.toHaveBeenCalled();

    // Finished on its own: leaving afterwards has nothing to stop either.
    act(() => spoken[0].onend?.());
    talker.unmount();
    expect(synthesis.cancel).not.toHaveBeenCalled();
  });

  test("a speaker cut off by another one leaves and stops without silencing it", () => {
    const { spoken, synthesis } = mockSpeech();
    const first = renderHook(() => useSpeech());
    const second = renderHook(() => useSpeech());
    act(() => first.result.current.say({ text: "el gato", lang: "es" }));
    act(() => second.result.current.say({ text: "the cat", lang: "en" }));
    synthesis.cancel.mockClear();

    // The browser has not told the first one it was cut off (Safari sometimes never does).
    act(() => first.result.current.stop());
    expect(first.result.current.speaking).toBe(false);
    first.unmount();
    expect(synthesis.cancel).not.toHaveBeenCalled();
    expect(second.result.current.speaking).toBe(true);

    // The second one is still its own voice: its stop does cancel.
    act(() => second.result.current.stop());
    expect(synthesis.cancel).toHaveBeenCalledOnce();
    expect(spoken).toHaveLength(2);
  });
});
