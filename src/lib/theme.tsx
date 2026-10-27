import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_THEME, isTheme, type Theme } from "../../worker/themes";

/** Also read by the script in index.html, which sets the theme before the CSS paints. */
const STORAGE_KEY = "kz_theme";

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isTheme(saved)) return saved;
  } catch {
    // storage blocked (private mode): fall through
  }
  return DEFAULT_THEME;
}

type ThemeApi = { theme: Theme; setTheme: (theme: Theme) => void };

const ThemeContext = createContext<ThemeApi | null>(null);

/**
 * The theme on <html data-theme>. Remembered on this device so the next load
 * (and the login page) starts in it; the account's own comes in with /api/me.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    // The phone's status bar takes the page colour.
    const bg = getComputedStyle(root).getPropertyValue("--theme-bg").trim();
    if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg);
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeApi {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme() needs <ThemeProvider>");
  return ctx;
}
