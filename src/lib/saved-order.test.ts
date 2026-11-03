import { describe, expect, it } from "vitest";
import { reconcileOrder } from "@/lib/saved-order";

describe("reconcileOrder", () => {
  it("keeps an order that still matches", () => {
    expect(reconcileOrder(["c", "a", "b"], ["a", "b", "c"])).toEqual(["c", "a", "b"]);
  });

  it("drops removed teams and closes the gap", () => {
    expect(reconcileOrder(["c", "x", "a", "b"], ["a", "b", "c"])).toEqual(["c", "a", "b"]);
  });

  it("adds new teams at the bottom, in the given order", () => {
    expect(reconcileOrder(["b", "a"], ["a", "b", "c", "d"])).toEqual(["b", "a", "c", "d"]);
  });

  it("handles both at once, and ignores duplicates", () => {
    expect(reconcileOrder(["z", "b", "b", "a"], ["a", "b", "c"])).toEqual(["b", "a", "c"]);
  });
});
