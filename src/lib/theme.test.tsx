import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ThemeProvider, useTheme } from "./theme";

function Probe() {
  const { theme, setTheme } = useTheme();
  return (
    <button type="button" onClick={() => setTheme("kung-fu")}>
      {theme}
    </button>
  );
}

describe("theme", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    document.head.innerHTML = '<meta name="theme-color" content="#f0eee6" />';
  });
  afterEach(() => {
    document.documentElement.style.removeProperty("--theme-bg");
  });

  test("starts in the default and puts it on <html>", () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByRole("button").textContent).toBe("cardigan");
    expect(document.documentElement.dataset.theme).toBe("cardigan");
  });

  test("starts in the theme this device used last", () => {
    localStorage.setItem("kz_theme", "ballpoint");
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(document.documentElement.dataset.theme).toBe("ballpoint");
  });

  test("ignores a remembered theme that no longer exists", () => {
    localStorage.setItem("kz_theme", "retired");
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(document.documentElement.dataset.theme).toBe("cardigan");
  });

  test("switching applies it, remembers it and gives the status bar the page colour", () => {
    document.documentElement.style.setProperty("--theme-bg", "#050a06");
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    act(() => screen.getByRole("button").click());
    expect(document.documentElement.dataset.theme).toBe("kung-fu");
    expect(localStorage.getItem("kz_theme")).toBe("kung-fu");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe("#050a06");
  });

  test("useTheme outside the provider says what is missing", () => {
    expect(() => render(<Probe />)).toThrow("useTheme() needs <ThemeProvider>");
  });
});
