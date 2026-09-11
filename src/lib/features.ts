/** Kept as a function so disabled routes remain type-checked as reachable. */
export function packsEnabled(): boolean {
  return false;
}

export function assertPacksEnabled(): void {
  if (!packsEnabled()) throw new Error("Pack mode is currently disabled");
}
