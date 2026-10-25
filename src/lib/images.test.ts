import { afterEach, describe, expect, it, vi } from "vitest";
import { fileToDataUrl, fitSize, keepAsIs, MAX_IMAGE_CHARS } from "./images";

/** A file of `size` bytes. */
function picked(size: number, type: string): File {
  return new File([new Uint8Array(size)], "photo.jpg", { type });
}

/** Stands in for the browser's Image; loads (or fails) as soon as it gets a src. */
function fakeImage(fail = false, width = 2000, height = 1000) {
  class FakeImage {
    naturalWidth = width;
    naturalHeight = height;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_src: string) {
      if (fail) this.onerror?.();
      else this.onload?.();
    }
  }
  vi.stubGlobal("Image", FakeImage);
}

/** Stubs the canvas: toDataURL answers with the given results, one per call. */
function fakeCanvas(...results: string[]) {
  const widths: number[] = [];
  const drawn: unknown[][] = [];
  const toDataURL = vi.fn(() => results[Math.min(toDataURL.mock.calls.length, results.length) - 1] ?? results.at(-1)!);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    widths.push(this.width);
    return {
      fillStyle: "",
      fillRect: () => {},
      drawImage: (...args: unknown[]) => drawn.push(args),
    } as unknown as CanvasRenderingContext2D;
  });
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(toDataURL);
  return { widths, drawn, toDataURL };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("keepAsIs", () => {
  it("keeps small png, jpeg and webp pictures", () => {
    expect(keepAsIs({ type: "image/png", size: 200_000 })).toBe(true);
    expect(keepAsIs({ type: "image/webp", size: 1 })).toBe(true);
  });

  it("resizes big files and foreign kinds (gif, pdf, no name)", () => {
    expect(keepAsIs({ type: "image/png", size: 300_000 })).toBe(false);
    expect(keepAsIs({ type: "image/gif", size: 10 })).toBe(false);
    expect(keepAsIs({ type: "", size: 10 })).toBe(false);
  });
});

describe("fitSize", () => {
  it("keeps the proportions and never grows", () => {
    expect(fitSize(2000, 1000, 1024)).toEqual({ width: 1024, height: 512 });
    expect(fitSize(1000, 2000, 1024)).toEqual({ width: 512, height: 1024 });
    expect(fitSize(8, 6, 1024)).toEqual({ width: 8, height: 6 });
  });

  it("never rounds down to zero", () => {
    expect(fitSize(1, 1000, 10)).toEqual({ width: 1, height: 10 });
  });
});

describe("fileToDataUrl", () => {
  it("a small picture goes to the server as it is", async () => {
    const dataUrl = await fileToDataUrl(picked(10, "image/png"));
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(dataUrl.length).toBeLessThan(100);
  });

  it("a big photo is resized to fit and becomes a JPEG", async () => {
    fakeImage();
    const { widths, drawn } = fakeCanvas("data:image/jpeg;base64,SMALL=");

    await expect(fileToDataUrl(picked(500_000, "image/jpeg"))).resolves.toBe("data:image/jpeg;base64,SMALL=");
    expect(widths[0]).toBe(1024); // 2000x1000 fitted into 1024x1024
    expect(drawn[0]).toEqual([expect.anything(), 0, 0, 1024, 512]);
  });

  it("a big png keeps its transparency as a png", async () => {
    fakeImage();
    fakeCanvas("data:image/png;base64,SMALL=");

    await fileToDataUrl(picked(500_000, "image/png"));
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith("image/png", 0.82);
  });

  it("keeps shrinking while the result is still too big", async () => {
    fakeImage();
    const tooBig = `data:image/jpeg;base64,${"A".repeat(MAX_IMAGE_CHARS + 10)}`;
    const { widths, toDataURL } = fakeCanvas(tooBig, tooBig, "data:image/jpeg;base64,OK=");

    await expect(fileToDataUrl(picked(500_000, "image/jpeg"))).resolves.toBe("data:image/jpeg;base64,OK=");
    expect(toDataURL).toHaveBeenCalledTimes(3);
    expect(widths[0]).toBe(1024);
    expect(widths[2]).toBeLessThan(1024); // the canvas really got smaller
  });

  it("a file that is no picture throws", async () => {
    fakeImage(true);
    await expect(fileToDataUrl(picked(500_000, "application/pdf"))).rejects.toThrow("image could not be read");
  });
});
