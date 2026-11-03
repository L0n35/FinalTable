import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageFallback, PageShell } from "@/components/page-shell";
import { WizardLoader } from "@/components/wizard/wizard-loader";
import { getSession, isCurrentUserAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "New league | Final Table" };

async function NewLeague() {
  const session = await getSession();
  if (!session.userId) redirect("/login?next=/leagues/new");
  const isAdmin = await isCurrentUserAdmin(session);

  return (
    <WizardLoader initialLeague={null} initialTeams={[]} isAdmin={isAdmin} initialStep="basics" />
  );
}

export default function NewLeaguePage() {
  return (
    <PageShell>
      <Suspense fallback={<PageFallback />}>
        <NewLeague />
      </Suspense>
    </PageShell>
  );
}
