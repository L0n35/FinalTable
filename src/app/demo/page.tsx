import type { Metadata } from "next";
import { PredictionLoader } from "@/components/prediction-loader";
import { demoLeague } from "@/lib/demo-league";

export const metadata: Metadata = { title: "Demo | Final Table" };

export default function DemoPage() {
  return <PredictionLoader league={demoLeague} />;
}
