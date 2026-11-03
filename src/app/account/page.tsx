import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountSettings } from "@/components/account-settings";
import { LegalLinks } from "@/components/legal-links";
import { PageFallback, PageShell } from "@/components/page-shell";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Your account | Final Table" };

async function Account() {
  const { supabase, userId } = await getSession();
  if (!userId) redirect("/login?next=/account");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .single();
  if (error) throw new Error(error.message);

  return <AccountSettings initialName={profile.display_name as string} />;
}

export default function AccountPage() {
  return (
    <PageShell>
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-4xl font-bold">Your account</h1>
        <Suspense fallback={<PageFallback />}>
          <Account />
        </Suspense>
        <LegalLinks />
      </div>
    </PageShell>
  );
}
