import { useLayoutEffect, type RefObject } from "react";

/** The browser grows a textarea itself (`field-sizing-content`). */
const native = typeof CSS !== "undefined" && CSS.supports?.("field-sizing", "content");

/**
 * A textarea as tall as its text where the browser has no field-sizing
 * (older iOS Safari, Firefox). Measured again when the text or its width
 * changes (turning the phone). Not exported from src/ui: fields only.
 */
export function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || native) return;
    const fit = () => {
      const scroll = window.scrollY;
      el.style.height = "auto";
      if (el.scrollHeight > 0) el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
      // Shrinking it to measure must not move the page under the finger.
      if (window.scrollY !== scroll) window.scrollTo({ top: scroll });
    };
    fit();
    let width = el.clientWidth;
    const resized =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            if (el.clientWidth === width) return;
            width = el.clientWidth;
            fit();
          });
    resized?.observe(el);
    return () => resized?.disconnect();
  }, [ref, value]);
}
