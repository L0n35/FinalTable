import { describe, expect, it } from "vitest";
import { chromeIntentUrl, detectInAppBrowser } from "@/lib/in-app-browser";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";

describe("detectInAppBrowser", () => {
  it.each([
    [`${IPHONE} Instagram 350.0`, "ios"],
    [`${IPHONE} [FBAN/FBIOS;FBAV/480.0]`, "ios"],
    [`${IPHONE} musical_ly_37.0`, "ios"],
    [`${ANDROID} Instagram 350.0 Android`, "android"],
    [`${ANDROID} [FB_IAB/FB4A;FBAV/480.0]`, "android"],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 Chrome/130.0 Mobile", "android"],
  ])("recognises %s", (userAgent, platform) => {
    expect(detectInAppBrowser(userAgent)).toEqual({ platform });
  });

  it.each([
    [`${IPHONE.replace("Mobile/15E148", "Version/18.0 Mobile/15E148 Safari/604.1")}`],
    [ANDROID],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36"],
  ])("leaves normal browsers alone: %s", (userAgent) => {
    expect(detectInAppBrowser(userAgent)).toBeNull();
  });
});

describe("chromeIntentUrl", () => {
  it("keeps the path and query", () => {
    expect(chromeIntentUrl("https://example.test/login?next=%2Fjoin%2FABC")).toBe(
      "intent://example.test/login?next=%2Fjoin%2FABC#Intent;scheme=https;package=com.android.chrome;end",
    );
  });
});
