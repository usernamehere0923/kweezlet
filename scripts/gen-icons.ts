// Renders assets/icons/*.svg to the PNGs in public/ (committed, so the build
// needs no browser). Run after changing an icon: npm run gen:icons
import { copyFileSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const jobs: [src: string, out: string, size: number][] = [
  ["tile-touch.svg", "apple-touch-icon.png", 180],
  ["icon.svg", "icon-192.png", 192],
  ["icon.svg", "icon-512.png", 512],
  ["tile-maskable.svg", "icon-maskable-512.png", 512],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [src, out, size] of jobs) {
  const svg = readFileSync(`assets/icons/${src}`, "utf8").replace(
    /width="64" height="64"/,
    `width="${size}" height="${size}"`,
  );
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await page.screenshot({
    path: `public/${out}`,
    omitBackground: true,
    clip: { x: 0, y: 0, width: size, height: size },
  });
  console.log(`public/${out}`);
}
await browser.close();
copyFileSync("assets/icons/icon.svg", "public/icon.svg");
console.log("public/icon.svg");
