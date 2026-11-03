import { safeNextPath } from "@/lib/safe-next-path";
import { createClient } from "@/lib/supabase/server";

// Relative, because request.url can report the server's bind address (such as 0.0.0.0)
// rather than the address the visitor actually used.
function redirectTo(path: string) {
  return new Response(null, { status: 307, headers: { Location: path } });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return redirectTo(next);
  }

  return redirectTo(`/login?error=1&next=${encodeURIComponent(next)}`);
}
