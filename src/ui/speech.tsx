import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "../i18n";
import { IconButton } from "./Button";

/**
 * Text to speech through the browser's own Web Speech API: no dependency, no
 * server, works on the iPhone. The language comes from the set's
 * term_lang / def_lang (worker/sets.ts).
 */
export type Speech = { text: string; lang: string | null };

/** Browsers without Web Speech (and jsdom) get no buttons at all. */
export function speechAvailable(): boolean {
  return typeof window !== "undefined" && Boolean(window.speechSynthesis);
}

// The utterance talking right now, from any speaker. cancel() is global, so a
// speaker checks this before stopping: a voice that took over is not its own.
let current: SpeechSynthesisUtterance | null = null;

/**
 * Say `speech` out loud, replacing whatever is still talking. `onDone` runs
 * when the voice stops (finished, or cut off by the next one).
 */
export function speak(speech: Speech, onDone?: () => void): SpeechSynthesisUtterance | null {
  if (!speechAvailable()) return null;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(speech.text);
  if (speech.lang) {
    utterance.lang = speech.lang;
    // A voice for the language when the browser lists one, else its own choice.
    const voice = window.speechSynthesis
      .getVoices()
      .find((candidate) => candidate.lang.toLowerCase().replace("_", "-").startsWith(speech.lang!.toLowerCase()));
    if (voice) utterance.voice = voice;
  }
  const done = () => {
    if (current === utterance) current = null;
    onDone?.();
  };
  utterance.onend = done;
  utterance.onerror = done;
  current = utterance;
  window.speechSynthesis.speak(utterance);
  return utterance;
}

/** Fall silent. With `only`: just when that utterance is still the one talking. */
export function stopSpeaking(only?: SpeechSynthesisUtterance): void {
  if (!speechAvailable() || (only && only !== current)) return;
  current = null;
  window.speechSynthesis.cancel();
}

/**
 * One voice at a time: say() talks (and cuts off whatever was talking),
 * stop() falls silent. A screen that goes away stops talking too.
 */
export function useSpeech(): { speaking: boolean; say: (speech: Speech) => void; stop: () => void } {
  const [speaking, setSpeaking] = useState(false);
  // This hook's latest utterance, null when silent. Older onDone callbacks must
  // not clear it. Holding it keeps Chrome from garbage-collecting it
  // mid-sentence, which loses its onend.
  const talking = useRef<SpeechSynthesisUtterance | null>(null);

  // Only this hook's own voice: another speaker on the screen keeps talking.
  useEffect(
    () => () => {
      if (talking.current) stopSpeaking(talking.current);
    },
    [],
  );

  const say = useCallback((speech: Speech) => {
    if (!speechAvailable()) return;
    setSpeaking(true);
    // Cleared first: the old voice's onDone may fire inside speak()'s cancel().
    talking.current = null;
    const utterance = speak(speech, () => {
      if (talking.current !== utterance) return;
      talking.current = null;
      setSpeaking(false);
    });
    talking.current = utterance;
  }, []);

  const stop = useCallback(() => {
    const mine = talking.current;
    talking.current = null;
    setSpeaking(false);
    if (mine) stopSpeaking(mine);
  }, []);

  return { speaking, say, stop };
}

/** A round button that says `speech` out loud. Tap again to stop talking. */
export function SpeakButton({
  speech,
  size = "sm",
  className,
}: {
  speech: Speech;
  size?: "sm" | "md";
  className?: string;
}): ReactNode {
  const { t } = useT();
  const { speaking, say, stop } = useSpeech();
  // New text (a flip, the next card or question): the old words stop.
  useEffect(() => stop, [speech.text, speech.lang, stop]);
  if (!speechAvailable()) return null;
  return (
    <IconButton
      icon={speaking ? "closeCircle" : "volume"}
      size={size}
      label={speaking ? t("study.stopSpeaking") : t("study.speak")}
      className={className}
      onClick={() => (speaking ? stop() : say(speech))}
    />
  );
}
