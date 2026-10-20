import { screen } from "@testing-library/react";

/** Whether the FlipCard face showing `text` is turned away (aria-hidden). */
export function faceHidden(text: string): boolean {
  return screen.getByText(text).closest("[aria-hidden]")!.getAttribute("aria-hidden") === "true";
}
