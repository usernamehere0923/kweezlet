import { describe, expect, test } from "vitest";
import { reconcileOrder } from "./deck";

describe("reconcileOrder", () => {
  test("starts in the given order", () => {
    expect(reconcileOrder([], [1, 2, 3])).toEqual([1, 2, 3]);
  });

  test("keeps the shuffled order of the terms still there", () => {
    expect(reconcileOrder([3, 1, 2], [1, 2, 3])).toEqual([3, 1, 2]);
  });

  test("drops terms that are gone and adds new ones at the end", () => {
    expect(reconcileOrder([3, 1, 2], [1, 3, 4, 5])).toEqual([3, 1, 4, 5]);
  });

  test("an empty set empties the deck", () => {
    expect(reconcileOrder([2, 1], [])).toEqual([]);
  });
});
