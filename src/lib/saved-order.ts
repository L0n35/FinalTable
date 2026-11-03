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
    localStorage.setItem(`${key}:at`, new Date().toISOString());
  } catch {
    // The order still lives in memory for this visit.
  }
}

export function clearSavedOrder(key: string) {
  try {
    localStorage.removeItem(key);
    localStorage.removeItem(`${key}:at`);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

// A draft left on this device is out of date once a newer prediction was submitted elsewhere.
export function isSavedOrderOlderThan(key: string, iso: string): boolean {
  try {
    const savedAt = localStorage.getItem(`${key}:at`);
    return !savedAt || new Date(savedAt).getTime() < new Date(iso).getTime();
  } catch {
    return true;
  }
}

// Fits an old prediction to the current teams: removed teams drop out and new ones join the
// bottom in the given order, so a player reviewing their table doesn't start from scratch.
export function reconcileOrder(saved: string[], teamIds: string[]): string[] {
  const known = new Set(teamIds);
  const kept = saved.filter((id, index) => known.has(id) && saved.indexOf(id) === index);
  const placed = new Set(kept);
  return [...kept, ...teamIds.filter((id) => !placed.has(id))];
}
