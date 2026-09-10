/**
 * Border treatment for a player card by rating tier — 90+ gets a rare,
 * glowing gold border; 85-89 a solid gold border; 80-84 a duller, muted
 * gold; anything below gets no special treatment. Includes a matching
 * background tint and glow — for flat list rows with no photo/
 * illustration of their own (the draft picker's search list, card-pack
 * candidates).
 */
export function cardTierBorderClass(overall: number): string {
  if (overall >= 90) {
    return "border-2 border-yellow-500 dark:border-yellow-400 bg-yellow-50 dark:bg-yellow-400/10 shadow-[0_0_10px_rgba(234,179,8,0.4)]";
  }
  if (overall >= 85) {
    return "border-2 border-yellow-600 dark:border-yellow-500 bg-yellow-50/60 dark:bg-yellow-600/10";
  }
  if (overall >= 80) {
    return "border border-amber-700/40 dark:border-amber-500/30";
  }
  return "border border-transparent";
}

/**
 * Same tiers, border color only — no background tint, no glow — for cards
 * that already have their own illustrated background and box-shadow (the
 * formation pitch's player cards), where a second bg-* or shadow-* utility
 * would silently fight the card's existing one instead of combining with
 * it. Falls back to `fallback` (the card's normal border color) below the
 * lowest tier. Pair with `cardTierGlowClass` if the card can spare its
 * shadow for the 90+ glow.
 */
export function cardTierAccentBorderClass(overall: number, fallback: string): string {
  if (overall >= 90) return "border-yellow-500 dark:border-yellow-400";
  if (overall >= 85) return "border-yellow-600 dark:border-yellow-500";
  if (overall >= 80) return "border-amber-700/40 dark:border-amber-500/30";
  return fallback;
}

/** The 90+ tier's glow, as a standalone box-shadow utility — only ever
 *  combine with a card's own shadow by choosing one or the other, not both
 *  (they're the same CSS property). Empty below 90. */
export function cardTierGlowClass(overall: number): string {
  return overall >= 90 ? "shadow-[0_0_10px_rgba(234,179,8,0.4)]" : "";
}
