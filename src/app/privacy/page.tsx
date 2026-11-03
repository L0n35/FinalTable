import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal-page";

export const metadata: Metadata = { title: "Privacy | Final Table" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy">
      <LegalSection title="What we collect">
        <p>When you sign in with Google, we receive your name, email address and profile picture address.</p>
        <p>
          When you play, we store your display name, the leagues you join, your predictions, any leagues and team
          logos you create, and any reports you send.
        </p>
      </LegalSection>

      <LegalSection title="Who can see it">
        <p>Your email address is never shown to other players.</p>
        <p>
          Your display name appears to people in your leagues, and on the leaderboards of public and official leagues,
          including to people who aren&apos;t signed in.
        </p>
        <p>
          Your predictions stay hidden until a league&apos;s deadline. After that, signed-in people who can see a league
          you play in can see your table for that season.
        </p>
        <p>Admins can see all leagues, and the name of whoever sent a report.</p>
      </LegalSection>

      <LegalSection title="How we use it">
        <p>
          Only to run the game: signing you in, working out scores and keeping the site safe. There are no ads, we
          don&apos;t sell your data, and we don&apos;t use analytics or tracking.
        </p>
      </LegalSection>

      <LegalSection title="Cookies and your device">
        <p>
          We use cookies only to keep you signed in. Your browser also keeps an unsubmitted prediction as a draft, so a
          refresh doesn&apos;t lose it.
        </p>
      </LegalSection>

      <LegalSection title="Services we use">
        <p>
          Supabase stores our database and logos, Vercel hosts the site, Google handles sign-in, and GitHub stores
          encrypted backups. These companies may process data outside your country.
        </p>
      </LegalSection>

      <LegalSection title="Keeping and deleting your data">
        <p>
          You can change your display name or delete your account at any time on your account page. Deleting it removes
          your profile, memberships and predictions straight away, and leagues nobody else is in.
        </p>
        <p>
          A league other people are in carries on and passes to its longest-standing member. Reports you sent stay,
          without your name. Encrypted backups are kept for 14 days and then removed. Uploaded logo files can stay in
          storage after their league is gone. Contact us if you want one removed.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
