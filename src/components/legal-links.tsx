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
