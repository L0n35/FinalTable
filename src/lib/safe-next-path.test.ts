import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/safe-next-path";

describe("safeNextPath", () => {
  it.each([
    ["/", "/"],
    ["/join/ABCD2345", "/join/ABCD2345"],
    ["/leagues/test?tab=picks#top", "/leagues/test?tab=picks#top"],
  ])("keeps the local path %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    [null],
    [undefined],
    [""],
    ["https://evil.example"],
    ["//evil.example"],
    ["///evil.example"],
    ["/\\evil.example"],
    ["\\\\evil.example"],
    ["/\t/evil.example"],
    ["javascript:alert(1)"],
    ["evil.example"],
  ])("sends %s home", (input) => {
    expect(safeNextPath(input)).toBe("/");
  });
});
