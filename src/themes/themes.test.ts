import { describe, expect, test } from "vitest";
import { THEMES } from "../../worker/themes";

// Themes are written by hand (or by an agent): these catch what the browser
// would silently get wrong, a missing token, a font file that isn't there,
// text that can't be read.
const css = import.meta.glob<string>("./*.css", { query: "?raw", import: "default", eager: true });
const fontFiles = Object.keys(import.meta.glob("../fonts/**/*.woff2"));
const sources = import.meta.glob<string>("../**/*.tsx", { query: "?raw", import: "default", eager: true });

function tokens(source: string): Map<string, string> {
  return new Map([...source.matchAll(/(--theme-[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const COLORS = [
  "bg",
  "surface",
  "sunken",
  "line",
  "line-soft",
  "ink",
  "ink-soft",
  "muted",
  "faint",
  "accent",
  "accent-strong",
  "accent-deep",
  "accent-wash",
  "on-accent",
  "teal",
  "teal-strong",
  "teal-wash",
  "correct",
  "correct-wash",
  "wrong",
  "wrong-strong",
  "wrong-wash",
];

// [text, background, minimum]. 4.5 for reading text (WCAG AA), 3 for button
// and tag labels: the floor the default theme itself has always met.
const PAIRS: [string, string, number][] = [
  ["ink", "bg", 4.5],
  ["ink", "surface", 4.5],
  ["muted", "surface", 4.5],
  ["muted", "bg", 4.5],
  ["faint", "surface", 3],
  ["teal", "surface", 3],
  ["correct", "surface", 3],
  ["wrong", "surface", 3],
  ["on-accent", "accent-strong", 3],
  ["on-accent", "teal", 3],
  ["on-accent", "correct", 3],
  ["on-accent", "wrong", 3],
  ["accent-deep", "accent-wash", 3],
  ["teal-strong", "teal-wash", 3],
  ["correct", "correct-wash", 3],
  ["wrong-strong", "wrong-wash", 3],
];

const reference = tokens(css["./cardigan.css"]);

describe("themes", () => {
  test("every theme has a file, and index.css loads it", () => {
    for (const id of THEMES) {
      expect(css[`./${id}.css`], id).toBeDefined();
      expect(css["./index.css"]).toContain(`@import "./${id}.css";`);
    }
  });

  test("the default also sits on :root, and has every token", () => {
    expect(css["./cardigan.css"]).toMatch(/:root,\s*\[data-theme="cardigan"\]/);
    // Guards the parsing: an empty map would let every comparison below pass.
    expect(reference.size).toBe(COLORS.length + 5);
  });

  test.each(THEMES)("%s sets every token, and only those", (id) => {
    const source = css[`./${id}.css`];
    expect(source).toContain(`[data-theme="${id}"]`);
    expect(source).toMatch(/color-scheme: (light|dark);/);
    expect([...tokens(source).keys()].sort()).toEqual([...reference.keys()].sort());
  });

  test.each(THEMES)("%s colours are plain #rrggbb", (id) => {
    const t = tokens(css[`./${id}.css`]);
    for (const name of COLORS) expect(t.get(`--theme-${name}`), name).toMatch(/^#[0-9a-f]{6}$/);
  });

  test.each(THEMES)("%s text stays readable", (id) => {
    const t = tokens(css[`./${id}.css`]);
    for (const [fg, bg, min] of PAIRS) {
      const ratio = contrast(t.get(`--theme-${fg}`)!, t.get(`--theme-${bg}`)!);
      expect(ratio, `${fg} on ${bg}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(min);
    }
  });

  test.each(THEMES)("%s fonts are all there", (id) => {
    for (const [, path] of css[`./${id}.css`].matchAll(/url\("([^"]+)"\)/g)) expect(fontFiles, path).toContain(path);
  });

  test("no Tailwind font-serif or font-sans left: they no longer exist and would silently do nothing", () => {
    for (const [file, source] of Object.entries(sources)) {
      expect(source, file).not.toMatch(/\bfont-(serif|sans)\b/);
    }
  });
});
