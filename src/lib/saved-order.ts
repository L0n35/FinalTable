// Browser storage can throw or come back empty, so every access is guarded.
export function readSavedOrder(key: string, teamIds: string[]): string[] | null {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!Array.isArray(saved) || saved.length !== teamIds.length) return null;
    const known = new Set(teamIds);
    const unique = new Set(saved);
    return unique.size === known.size && saved.every((id) => known.has(id))
      ? (saved as string[])
      : null;
  } catch {
    return null;
  }
}

export function writeSavedOrder(key: string, order: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(order));
  } catch {
    // The order still lives in memory for this visit.
  }
}
