"use client";

import type { ComponentProps } from "react";
import dynamic from "next/dynamic";
import { PageFallback } from "@/components/page-shell";
import type { LeagueWizard } from "@/components/wizard/league-wizard";

// Date fields and time zones depend on the viewer's device, so the wizard only renders in the browser.
const Wizard = dynamic(
  () => import("@/components/wizard/league-wizard").then((mod) => mod.LeagueWizard),
  { ssr: false, loading: () => <PageFallback /> },
);

export function WizardLoader(props: ComponentProps<typeof LeagueWizard>) {
  return <Wizard {...props} />;
}
