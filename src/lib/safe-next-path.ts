// Login returns people to where they started. Only paths on this site are allowed,
// so a crafted link can't use the login flow to send someone to another website.
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/")) return "/";

  const base = "https://final-table.invalid";
  try {
    const url = new URL(value, base);
    if (url.origin !== base || value.startsWith("//") || value.includes("\\")) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
