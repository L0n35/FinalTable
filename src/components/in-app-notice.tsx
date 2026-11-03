"use client";

import { useState } from "react";
import { copyText } from "@/lib/browser-utils";
import { chromeIntentUrl, type InAppBrowser } from "@/lib/in-app-browser";

export function InAppNotice({
  browser,
  onContinue,
}: {
  browser: NonNullable<InAppBrowser>;
  onContinue: () => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <h2 className="font-display text-2xl font-bold">Open in your browser</h2>
      <p className="mt-1 text-muted">
        Google sign-in doesn&apos;t work inside this app.{" "}
        {browser.platform === "ios"
          ? "Tap the ••• or share menu, then choose Open in Safari."
          : "Open this page in your phone's browser to continue."}
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {browser.platform === "android" && (
          <a
            href={chromeIntentUrl(window.location.href)}
            className="flex h-12 items-center justify-center rounded-lg bg-accent font-semibold text-accent-ink"
          >
            Open in Chrome
          </a>
        )}
        <button
          type="button"
          onClick={async () => setCopied(await copyText(window.location.href))}
          className="h-12 rounded-lg border border-line font-semibold"
        >
          {copied ? "Link copied" : "Copy link"}
        </button>
        <button type="button" onClick={onContinue} className="h-11 text-sm text-muted underline">
          Try signing in here anyway
        </button>
      </div>
    </div>
  );
}
