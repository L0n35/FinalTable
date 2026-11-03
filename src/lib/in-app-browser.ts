export type InAppBrowser = { platform: "ios" | "android" | "other" } | null;

const IN_APP_MARKERS =
  /Instagram|FBAN|FBAV|FB_IAB|FBIOS|musical_ly|TikTok|BytedanceWebview|Snapchat|LinkedInApp|Pinterest|Line\/|MicroMessenger|Twitter|; wv\)/i;

// Google blocks sign-in inside the browsers some apps use to open links.
export function detectInAppBrowser(userAgent: string): InAppBrowser {
  if (!IN_APP_MARKERS.test(userAgent)) return null;
  if (/iPhone|iPad|iPod/i.test(userAgent)) return { platform: "ios" };
  if (/Android/i.test(userAgent)) return { platform: "android" };
  return { platform: "other" };
}

// Android can hand a page to Chrome directly with an intent link.
export function chromeIntentUrl(pageUrl: string): string {
  const url = new URL(pageUrl);
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${url.protocol.replace(":", "")};package=com.android.chrome;end`;
}
