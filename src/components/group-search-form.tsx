export function GroupSearchForm({ query = "" }: { query?: string }) {
  return (
    <form action="/explore/search" className="flex gap-2">
      <input
        type="search"
        name="q"
        aria-label="Search leagues and groups"
        defaultValue={query}
        maxLength={60}
        placeholder="Search leagues and groups"
        className="h-12 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 placeholder:text-muted/70 focus-visible:outline-2 focus-visible:outline-accent"
      />
      <button type="submit" className="h-12 shrink-0 rounded-lg border border-line px-4 font-semibold">
        Search
      </button>
    </form>
  );
}
