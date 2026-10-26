// Picking an image on the phone can hand over a 12 MB photo. These helpers
// turn it into a small data URL before it goes to the API (worker/images.ts
// caps one at 600,000 characters). No dependencies: the canvas does the work.

/** Under this many characters a data URL goes to the server as it is. */
export const MAX_IMAGE_CHARS = 550_000;

/** Files this small keep their pixels (and their transparency). */
const SMALL_FILE_BYTES = 250_000;
/** The longest side of a resized image. */
const MAX_SIDE = 1024;
const KEEP_MIME = ["image/png", "image/jpeg", "image/webp"];

/** A small file of an accepted kind may keep its pixels; big ones get resized. */
export function keepAsIs(file: { type: string; size: number }): boolean {
  return file.size <= SMALL_FILE_BYTES && KEEP_MIME.includes(file.type);
}

/** The size that fits into `max` x `max`, keeping the proportions. Never grows. */
export function fitSize(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("image could not be read"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image could not be read"));
    img.src = src;
  });
}

/** JPEG gets a white background (it has no transparency); PNG keeps its alpha. */
function shrink(img: HTMLImageElement, width: number, height: number, mime: "image/png" | "image/jpeg"): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("images need a canvas");
  if (mime === "image/jpeg") {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
  }
  // Drawing re-encodes the picture, which also drops its EXIF data.
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL(mime, 0.82);
}

/**
 * A picked file as a small data URL, the way the image API accepts it.
 * Throws "image could not be read" when the file is no picture at all, or
 * when it is still too big for the API after shrinking.
 */
export async function fileToDataUrl(file: File): Promise<string> {
  const original = await readAsDataUrl(file);
  const img = await loadImage(original);
  // A small file can still be huge in pixels (a flat 8000x8000 PNG).
  if (keepAsIs(file) && Math.max(img.naturalWidth, img.naturalHeight) <= MAX_SIDE) return original;
  // Photos become JPEG (small); drawings and screenshots keep their PNG alpha.
  const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
  let { width, height } = fitSize(img.naturalWidth, img.naturalHeight, MAX_SIDE);
  for (let tries = 0; ; tries++) {
    const dataUrl = shrink(img, width, height, mime);
    if (dataUrl.length <= MAX_IMAGE_CHARS) return dataUrl;
    if (tries >= 3) throw new Error("image could not be read");
    width = Math.max(1, Math.round(width * 0.75));
    height = Math.max(1, Math.round(height * 0.75));
  }
}
