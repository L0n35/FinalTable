import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/legal-links";
import { LoginCard } from "@/components/login-card";

export const metadata: Metadata = { title: "Sign in | Final Table" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 py-8">
      <Link href="/" className="text-center font-display text-4xl font-bold">
        Final Table
      </Link>
      <p className="mt-1 mb-8 text-center text-muted">Sign in to make your prediction</p>
      <Suspense fallback={<div className="h-13 rounded-lg bg-surface" />}>
        <LoginCard />
      </Suspense>
      <p className="mt-4 text-center text-sm text-muted">By continuing, you agree to the terms and privacy notice.</p>
      <SiteFooter />
    </main>
  );
}
