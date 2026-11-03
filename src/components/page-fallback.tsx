// Separate from PageShell, because browser-only components use this and the shell's header can't load there.
export function PageFallback() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <div className="h-10 w-2/3 animate-pulse rounded-lg bg-surface" />
      <div className="h-14 animate-pulse rounded-lg bg-surface" />
      <div className="h-14 animate-pulse rounded-lg bg-surface" />
      <div className="h-14 animate-pulse rounded-lg bg-surface" />
    </div>
  );
}
