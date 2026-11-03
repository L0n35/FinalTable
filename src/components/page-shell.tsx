import type { ReactNode } from "react";
import { SiteFooter } from "@/components/legal-links";
import { SiteHeader } from "@/components/site-header";

export function PageShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className={`mx-auto w-full px-4 pb-10 ${wide ? "max-w-5xl" : "max-w-lg"}`}>
      <SiteHeader />
      <main>{children}</main>
      <div className="mt-8">
        <SiteFooter />
      </div>
    </div>
  );
}
