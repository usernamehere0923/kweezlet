import { LANGUAGES, type Language } from "../../worker/languages";
import { LANG_KEY, type TKey } from "../i18n";
import type { Option } from "../ui";

type Translate = (key: TKey) => string;

/** What the AI makes: the source screen and "Make anew" offer the same. */
export type CardKind = "auto" | "vocabulary" | "questions" | "terms";

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
  ];
}
