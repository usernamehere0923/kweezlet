import { vi } from "vitest";

/** What a fake utterance carries; `spoken` collects every one that was made. */
export type FakeUtterance = {
  text: string;
  lang: string;
  voice: { lang: string } | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

/**
 * Stub for the Web Speech API (jsdom has none). `spoken` collects what was
 * said, `synthesis` records speak() and cancel() calls.
 *
 *   const { spoken, synthesis } = mockSpeech([{ lang: "de-DE" }]);
 */
export function mockSpeech(voices: { lang: string }[] = []) {
  const spoken: FakeUtterance[] = [];
  class Utterance implements FakeUtterance {
    text: string;
    lang = "";
    voice: { lang: string } | null = null;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(text: string) {
      this.text = text;
      spoken.push(this);
    }
  }
  const synthesis = { speak: vi.fn(), cancel: vi.fn(), getVoices: () => voices };
  vi.stubGlobal("SpeechSynthesisUtterance", Utterance);
  vi.stubGlobal("speechSynthesis", synthesis);
  return { spoken, synthesis };
}
