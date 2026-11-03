"use client";

import type { ComponentProps } from "react";
import dynamic from "next/dynamic";
import type { StandingsEditor as Editor } from "@/components/standings-editor";

const StandingsEditor = dynamic(
  () => import("@/components/standings-editor").then((mod) => mod.StandingsEditor),
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

export function StandingsLoader(props: ComponentProps<typeof Editor>) {
  return <StandingsEditor {...props} />;
}
