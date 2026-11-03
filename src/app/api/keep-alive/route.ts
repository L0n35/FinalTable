import { createClient } from "@/lib/supabase/server";

// Called daily by Vercel Cron, because Supabase's free plan pauses after a week without activity.
// It does one small public read, no more than opening the home page, so it needs no secret.
export async function GET() {
  const supabase = await createClient();
  const { error } = await supabase.from("sports").select("id").limit(1);
  if (error) {
    console.error("Keep-alive failed:", error.message);
    return Response.json({ ok: false }, { status: 500 });
  }
  return Response.json({ ok: true });
}
