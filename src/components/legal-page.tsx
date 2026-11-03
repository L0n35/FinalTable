import type { ReactNode } from "react";
import { PageShell } from "@/components/page-shell";

const LAST_UPDATED = "3 November 2026";
const CONTACT_URL = "https://github.com/L0n35/FinalTable/issues";

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-2xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <PageShell>
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="font-display text-4xl font-bold">{title}</h1>
          <p className="text-sm text-muted">Last updated {LAST_UPDATED}</p>
        </div>
        {children}
        <LegalSection title="Contact">
          <p>
            Questions or a request?{" "}
            <a href={CONTACT_URL} className="underline">
              Contact us through GitHub
            </a>
            . Please don&apos;t post private details there, because it&apos;s public.
          </p>
        </LegalSection>
      </div>
    </PageShell>
  );
}
