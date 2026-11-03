import Link from "next/link";

export function LegalLinks() {
  return (
    <p className="py-2 text-center text-sm text-muted">
      <Link href="/terms" className="underline">
        Terms
      </Link>
      {" · "}
      <Link href="/privacy" className="underline">
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
