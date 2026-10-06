// Renders assets/og/card.html to public/og.png (1200x630, committed).
// Run after changing the card: npm run gen:og
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(pathToFileURL(resolve("assets/og/card.html")).href);
await page.evaluate(() => document.fonts.ready);
const loaded = await page.evaluate(
  () => document.fonts.check('40px "Anthropic Serif"') && document.fonts.check('40px "Anthropic Sans"'),
);
if (!loaded) throw new Error("fonts did not load; the card would fall back to a system font");
await page.screenshot({ path: "public/og.png" });
await browser.close();
console.log("public/og.png");
