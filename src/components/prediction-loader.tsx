"use client";

import type { ComponentProps } from "react";
import dynamic from "next/dynamic";
import type { PredictionScreen as Screen } from "@/components/prediction-screen";

// The screen restores saved orders and a countdown from the browser, so it only renders there.
const PredictionScreen = dynamic(
  () => import("@/components/prediction-screen").then((mod) => mod.PredictionScreen),
  {
    ssr: false,
    loading: () => (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-1.5 px-4 pt-24" aria-busy="true">
        {Array.from({ length: 10 }, (_, index) => (
          <div key={index} className="h-14 animate-pulse rounded-lg bg-surface" />
        ))}
      </div>
    ),
  },
);

export function PredictionLoader(props: ComponentProps<typeof Screen>) {
  return <PredictionScreen {...props} />;
}
