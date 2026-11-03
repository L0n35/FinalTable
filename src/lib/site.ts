// Follows the production domain set on Vercel, so moving to a new one needs no code change.
export function siteUrl(path = ""): string {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return `${host ? `https://${host}` : "http://localhost:3000"}${path}`;
}
