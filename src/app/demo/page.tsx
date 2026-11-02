import type { Metadata } from "next";
import { PredictionLoader } from "@/components/prediction-loader";

export const metadata: Metadata = { title: "Demo | Final Table" };

export default function DemoPage() {
  return <PredictionLoader />;
}
