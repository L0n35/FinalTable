import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal-page";

export const metadata: Metadata = { title: "Terms | Final Table" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use">
      <LegalSection title="The game">
        <p>
          Final Table is a free prediction game for fun. There is no paid entry, no prizes and no betting. By using it,
          you agree to these terms.
        </p>
      </LegalSection>

      <LegalSection title="What you upload">
        <p>
          You are responsible for what you add, including league names, team names, logos and your display name. Only
          upload images you have the right to use. Club and league logos are often trademarked or under copyright.
        </p>
        <p>
          You keep your rights in what you upload, and you allow us to store and show it so the game can run.
        </p>
      </LegalSection>

      <LegalSection title="Rules">
        <p>
          Don&apos;t add anything illegal, hateful, sexual or abusive, impersonate others, or try to break the site or
          get around its limits.
        </p>
        <p>
          Admins can hide or delete leagues and remove logos, and we may remove accounts that break these rules. Anyone
          can report a problem from a league page.
        </p>
      </LegalSection>

      <LegalSection title="Scores and results">
        <p>
          League creators and admins enter standings by hand, so they can be wrong or late. Official leagues are run by
          this site and aren&apos;t connected to or endorsed by any real league or club.
        </p>
      </LegalSection>

      <LegalSection title="No guarantees">
        <p>
          This is a free project provided as it is. It may change, stop or lose data, and we can&apos;t promise it will
          always be available. As far as the law allows, we aren&apos;t liable for any loss from using it.
        </p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>We may update these terms, and will change the date on this page when we do.</p>
      </LegalSection>
    </LegalPage>
  );
}
