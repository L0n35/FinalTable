import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { JoinButton } from "@/components/join-button";
import { JoinCodeForm } from "@/components/join-code-form";
import { LocalTime } from "@/components/local-time";
import { PageFallback, PageShell } from "@/components/page-shell";
import { getSession } from "@/lib/auth";
import { isLocked } from "@/lib/leagues";

export const metadata: Metadata = { title: "Join a league | Final Table" };

type Preview = {
  id: string;
  slug: string;
  name: string;
  type: string;
  sport: string | null;
  team_count: number;
  deadline: string;
  creator_name: string | null;
};

async function Join({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ join?: string | string[] }>;
}) {
  const [{ code }, { join }] = await Promise.all([params, searchParams]);
  const { supabase, userId } = await getSession();

  const { data } = await supabase.rpc("get_league_preview", { p_join_code: code });
  const preview = ((data ?? []) as Preview[])[0];

  if (!preview) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-3xl font-bold">We can&apos;t find that league</h1>
        <p className="text-muted">
          The code may be mistyped, or it may have been replaced. Check with whoever invited you.
        </p>
        <JoinCodeForm />
      </div>
    );
  }

  if (userId) {
    const { data: membership } = await supabase
      .from("memberships")
      .select("role")
      .eq("league_id", preview.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (membership) redirect(`/leagues/${preview.slug}`);
  }

  const started = isLocked({ status: "published", deadline: preview.deadline });
  const nextPath = `/join/${encodeURIComponent(code)}?join=1`;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-sm font-semibold text-muted">You&apos;re invited to</p>
        <h1 className="font-display text-4xl font-bold">{preview.name}</h1>
        {preview.creator_name && <p className="mt-1 text-muted">Run by {preview.creator_name}</p>}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border border-line bg-surface p-4">
        {preview.sport && (
          <>
            <dt className="text-muted">Sport</dt>
            <dd className="font-semibold">{preview.sport}</dd>
          </>
        )}
        <dt className="text-muted">Teams</dt>
        <dd className="font-semibold">{preview.team_count}</dd>
        <dt className="text-muted">{started ? "Started" : "Locks"}</dt>
        <dd className="font-semibold">
          <LocalTime iso={preview.deadline} />
        </dd>
      </dl>
      {started && (
        <p className="text-muted">
          Predictions have closed, but you can still follow along as a spectator.
        </p>
      )}
      {userId ? (
        <JoinButton
          leagueId={preview.id}
          slug={preview.slug}
          joinCode={code}
          label={started ? "Follow this league" : "Join this league"}
          autoJoin={join === "1"}
        />
      ) : (
        <Link
          href={`/login?next=${encodeURIComponent(nextPath)}`}
          className="flex h-13 items-center justify-center rounded-lg bg-accent font-display text-xl font-bold text-accent-ink"
        >
          {started ? "Sign in to follow" : "Sign in to join"}
        </Link>
      )}
    </div>
  );
}

export default function JoinPage({ params, searchParams }: PageProps<"/join/[code]">) {
  return (
    <PageShell>
      <Suspense fallback={<PageFallback />}>
        <Join params={params} searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}
