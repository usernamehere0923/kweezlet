import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { deCH } from "./de-CH";
import { en } from "./en";

export const LOCALES = ["en", "de-CH"] as const;
export type Locale = (typeof LOCALES)[number];
export type TKey = keyof typeof en;
/** Keys that come as a _one/_other pair, without the suffix: "study.terms". */
export type TPluralKey = TKey extends infer K ? (K extends `${infer B}_one` ? B : never) : never;
type Vars = Record<string, string | number>;

const dictionaries: Record<Locale, Record<TKey, string>> = { en, "de-CH": deCH };

/** True if `key` exists, e.g. for codes that come from the server. */
export function isTKey(key: string): key is TKey {
  return key in en;
}
const STORAGE_KEY = "kz_locale";

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "de-CH") return saved;
  } catch {
    // storage blocked (private mode): fall through
  }
  return navigator.language.toLowerCase().startsWith("de") ? "de-CH" : "en";
}

function fill(text: string, vars?: Vars): string {
  return vars ? text.replace(/\{(\w+)\}/g, (m, name: string) => String(vars[name] ?? m)) : text;
}

type I18n = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** t("home.greeting", { name: "Anna" }) */
  t: (key: TKey, vars?: Vars) => string;
  /** tn("study.terms", 3) -> "3 terms" (picks _one or _other) */
  tn: (key: TPluralKey, count: number, vars?: Vars) => string;
  formatNumber: (n: number, options?: Intl.NumberFormatOptions) => string;
  formatDate: (d: Date | number, options?: Intl.DateTimeFormatOptions) => string;
};

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    document.documentElement.lang = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo<I18n>(() => {
    const dict = dictionaries[locale];
    const plural = new Intl.PluralRules(locale);
    return {
      locale,
      setLocale,
      t: (key, vars) => fill(dict[key], vars),
      tn: (key, count, vars) => {
        const form = plural.select(count) === "one" ? "one" : "other";
        return fill(dict[`${key}_${form}` as TKey], { count, ...vars });
      },
      formatNumber: (n, options) => new Intl.NumberFormat(locale, options).format(n),
      formatDate: (d, options) => new Intl.DateTimeFormat(locale, options).format(d),
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT() needs <I18nProvider>");
  return ctx;
}
