import { LANGUAGES, type Language } from "../../worker/languages";
import type { AnswerWith } from "../../worker/sets";
import { LANG_KEY, type TKey } from "../i18n";
import type { Option } from "../ui";

type Translate = (key: TKey) => string;

/** What the AI makes: the source screen and "Make anew" offer the same. "cloze": gap sentences. */
export type CardKind = "auto" | "vocabulary" | "questions" | "terms" | "cloze";

/** A CardKind as a run's kind and form: gap sentences let the AI read the material itself. */
export function runChoice(choice: CardKind): { kind: Exclude<CardKind, "cloze">; form: "pair" | "cloze" } {
  return choice === "cloze" ? { kind: "auto", form: "cloze" } : { kind: choice, form: "pair" };
}

/** What a draft was asked to make, as one CardKind. */
export function draftChoice(draft: { kind: Exclude<CardKind, "cloze">; form: "pair" | "cloze" }): CardKind {
  return draft.form === "cloze" ? "cloze" : draft.kind;
}

/** The card languages for a Select, "Not set" first. */
export function languageOptions(t: Translate): Option<Language | "">[] {
  return [
    { value: "", label: t("lang.none") },
    ...LANGUAGES.map((lang) => ({ value: lang, label: t(LANG_KEY[lang]) })),
  ];
}

export function kindOptions(t: Translate): Option<CardKind>[] {
  return [
    { value: "auto", label: t("ai.kind.auto") },
    { value: "vocabulary", label: t("ai.kind.vocabulary") },
    { value: "questions", label: t("ai.kind.questions") },
    { value: "terms", label: t("ai.kind.terms") },
    { value: "cloze", label: t("ai.kind.cloze") },
  ];
}

/** Which side a set's questions ask for: the set form and the test setup offer the same. */
export function answerWithOptions(t: Translate): Option<AnswerWith>[] {
  return [
    { value: "both", label: t("sets.answerWith.both") },
    { value: "term", label: t("sets.answerWith.term") },
    { value: "definition", label: t("sets.answerWith.definition") },
  ];
}
