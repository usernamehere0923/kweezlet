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
  utterance.onend = () => onDone?.();
  utterance.onerror = () => onDone?.();
  window.speechSynthesis.speak(utterance);
  return utterance;
}

export function stopSpeaking(): void {
  if (speechAvailable()) window.speechSynthesis.cancel();
}

/**
 * One voice at a time: say() talks (and cuts off whatever was talking),
 * stop() falls silent. A screen that goes away stops talking too.
 */
export function useSpeech(): { speaking: boolean; say: (speech: Speech) => void; stop: () => void } {
  const [speaking, setSpeaking] = useState(false);
  // Which say() is the current one; older onDone callbacks must not clear it.
  const turn = useRef(0);

  useEffect(() => () => stopSpeaking(), []);

  const say = useCallback((speech: Speech) => {
    if (!speechAvailable()) return;
    const mine = ++turn.current;
    setSpeaking(true);
    speak(speech, () => {
      if (turn.current === mine) setSpeaking(false);
    });
  }, []);

  const stop = useCallback(() => {
    turn.current += 1;
    setSpeaking(false);
    stopSpeaking();
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
