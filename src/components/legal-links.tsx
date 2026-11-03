import Link from "next/link";

// Not prefetched, because these are on every page and rarely tapped.
export function LegalLinks() {
  return (
    <p className="py-2 text-center text-sm text-muted">
      <Link href="/terms" prefetch={false} className="underline">
        Terms
      </Link>
      {" · "}
      <Link href="/privacy" prefetch={false} className="underline">
        Privacy
      </Link>
    </p>
  );
}

export function SiteFooter() {
  return (
    <footer className="text-center text-sm text-muted">
      <LegalLinks />
      <p>Independent fan game, not affiliated with any league or club.</p>
    </footer>
  );
}
