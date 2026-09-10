import { prisma } from "@/lib/db";
import { shuffled, realPremierLeagueCoachPool } from "@/lib/league-data";
import { STARTER_TOTAL, type PositionGroup } from "@/lib/positions";
import type { Prisma } from "@/generated/prisma/client";

export const STARTING_CASH = 15000;
/** Packs mode builds a fixed starting XI (1 GK/4 DEF/3 MID/3 FWD) — one
 *  outline per slot on the squad-builder pitch, no bench. */
export const SQUAD_SIZE = STARTER_TOTAL;
export const CANDIDATES_PER_POSITION = 5;
/** Each pack (player or coach) now fills exactly one outline. */
export const PICKS_PER_POSITION = 1;

/**
 * Six "enhanced" card colors, ordered rarest-last. `weight` is the relative
 * chance of landing on this color GIVEN a card already rolled as enhanced
 * (see PACK_TIERS' enhancedChance) — Red is the common enhanced pull, going
 * all the way up to Flashback, the rarest, strongest chase card. Anime sits
 * above Purple (rarer, bigger boost) — swapped from its original weight/
 * boost per direct request.
 */
export const CARD_COLORS = {
  red: { label: "Red", weight: 50, boostMin: 1, boostMax: 2 },
  dark_blue: { label: "Dark Blue", weight: 30, boostMin: 3, boostMax: 4 },
  purple: { label: "Purple", weight: 18, boostMin: 4, boostMax: 5 },
  anime: { label: "Anime", weight: 12, boostMin: 5, boostMax: 6 },
  royal_gold: { label: "Royal Gold", weight: 5, boostMin: 7, boostMax: 7 },
  flashback: { label: "Flashback", weight: 2, boostMin: 8, boostMax: 8 },
} as const;

export type CardColor = keyof typeof CARD_COLORS;

/**
 * Border, background photo texture, and glow for each enhanced color — same
 * "premium card" construction as the elite 90+ tier: a real art-deco/foil
 * texture image (see formation-pitch.tsx's GOLD_ELITE_TEXTURE/SILVER_TIER_
 * TEXTURE for the non-color tiers that share this treatment) instead of a
 * flat gradient. `ring` is the photo's glow/border tint, kept per-color so
 * the photo reads as part of the same finish as the card around it.
 */
export const CARD_COLOR_STYLES: Record<
  CardColor,
  { border: string; background: string; glow: string; text: string; backgroundImage: string; ring: string }
> = {
  red: {
    border: "border-red-500 dark:border-red-400",
    background:
      "bg-gradient-to-br from-red-50 via-red-100 to-red-200 dark:from-neutral-900 dark:via-red-950/50 dark:to-neutral-950",
    glow: "shadow-[0_0_14px_rgba(239,68,68,0.6)]",
    text: "text-red-300",
    backgroundImage: "/cards/red-bg.jpeg",
    ring: "border border-red-200/60 shadow-[0_0_18px_rgba(248,113,113,0.55)] bg-neutral-800",
  },
  dark_blue: {
    border: "border-blue-400",
    background:
      "bg-gradient-to-br from-blue-50 via-blue-100 to-blue-200 dark:from-neutral-900 dark:via-blue-950/60 dark:to-neutral-950",
    glow: "shadow-[0_0_14px_rgba(37,99,235,0.6)]",
    text: "text-blue-300",
    backgroundImage: "/cards/dark-blue-bg.jpeg",
    ring: "border border-blue-200/60 shadow-[0_0_18px_rgba(96,165,250,0.55)] bg-neutral-800",
  },
  anime: {
    border: "border-orange-400",
    background:
      "bg-gradient-to-br from-orange-50 via-orange-100 to-orange-200 dark:from-neutral-900 dark:via-orange-950/50 dark:to-neutral-950",
    glow: "shadow-[0_0_14px_rgba(251,146,60,0.6)]",
    text: "text-orange-200",
    backgroundImage: "/cards/anime-bg.jpeg",
    ring: "border border-orange-200/60 shadow-[0_0_18px_rgba(251,146,60,0.55)] bg-neutral-800",
  },
  purple: {
    border: "border-purple-400",
    background:
      "bg-gradient-to-br from-purple-50 via-purple-100 to-purple-200 dark:from-neutral-900 dark:via-purple-950/50 dark:to-neutral-950",
    glow: "shadow-[0_0_14px_rgba(168,85,247,0.6)]",
    text: "text-purple-300",
    backgroundImage: "/cards/purple-bg.jpeg",
    ring: "border border-purple-200/60 shadow-[0_0_18px_rgba(216,180,254,0.55)] bg-neutral-800",
  },
  royal_gold: {
    border: "border-yellow-500 dark:border-yellow-400",
    background:
      "bg-gradient-to-br from-amber-50 via-yellow-100 to-amber-200 dark:from-neutral-900 dark:via-amber-950/50 dark:to-neutral-950",
    glow: "shadow-[0_0_14px_rgba(234,179,8,0.6)]",
    text: "text-yellow-200",
    // The rare, ornate gold foil texture that used to be the plain elite
    // 90+ background — moved here since Royal Gold (the rarest enhanced
    // color) is the better home for the most elaborate art; elite 90+ now
    // gets its own plainer gold-metal texture instead (GOLD_ELITE_TEXTURE).
    backgroundImage: "/cards/gold-bg.jpeg",
    ring: "border border-amber-200/60 shadow-[0_0_18px_rgba(252,211,77,0.55)] bg-neutral-800",
  },
  flashback: {
    border: "border-orange-600 dark:border-orange-500",
    background:
      "bg-gradient-to-br from-orange-100 via-orange-200 to-red-200 dark:from-neutral-950 dark:via-orange-950/60 dark:to-neutral-950",
    glow: "shadow-[0_0_16px_rgba(234,88,12,0.7)]",
    text: "text-orange-100",
    backgroundImage: "/cards/flashback-bg.jpeg",
    ring: "border border-orange-300/60 shadow-[0_0_20px_rgba(234,88,12,0.65)] bg-neutral-800",
  },
};

/** Rating bands a base (pre-boost) candidate is drawn from — every pack
 *  tier has some weight on the top band, so even the cheapest pack always
 *  has a shot at a 90+ pull, just a small one. */
const RATING_BANDS = [
  { min: 1, max: 74 },
  { min: 75, max: 84 },
  { min: 85, max: 89 },
  { min: 90, max: 99 },
] as const;

export const PACK_TIERS = [
  {
    key: "bronze",
    name: "Bronze Pack",
    price: 200,
    enhancedChance: 0.03,
    bandWeights: [0.65, 0.3, 0.045, 0.005],
  },
  {
    key: "silver",
    name: "Silver Pack",
    price: 500,
    enhancedChance: 0.06,
    bandWeights: [0.4, 0.42, 0.15, 0.03],
  },
  {
    key: "gold",
    name: "Gold Pack",
    price: 1200,
    enhancedChance: 0.1,
    bandWeights: [0.15, 0.4, 0.32, 0.13],
  },
  {
    key: "ultimate",
    name: "Ultimate Pack",
    price: 2500,
    enhancedChance: 0.18,
    bandWeights: [0.05, 0.2, 0.4, 0.35],
  },
  {
    key: "diamond",
    name: "Diamond Pack",
    price: 6000,
    enhancedChance: 0.32,
    bandWeights: [0, 0.05, 0.25, 0.7],
  },
] as const;

export type PackTierKey = (typeof PACK_TIERS)[number]["key"];

/** The shape `generatePackCandidates`/`generateCoachPackCandidates` actually
 *  need — either a real `PACK_TIERS` key (real gameplay, priced/purchasable)
 *  or a plain object for a one-off tier that was never meant to be
 *  purchasable (the pack demo's "even more powerful" preview-only tier). */
export type PackTierConfig = {
  key: string;
  name: string;
  price: number;
  enhancedChance: number;
  bandWeights: readonly number[];
};

export function getPackTier(key: string): PackTierConfig {
  const tier = PACK_TIERS.find((t) => t.key === key);
  if (!tier) throw new Error("Unknown pack tier");
  return tier;
}

function weightedRandomIndex(weights: readonly number[]): number {
  const total = weights.reduce((s, w) => s + w, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return i;
  }
  return weights.length - 1;
}

function rollColor(): CardColor {
  const colors = Object.entries(CARD_COLORS) as [CardColor, (typeof CARD_COLORS)[CardColor]][];
  const idx = weightedRandomIndex(colors.map(([, c]) => c.weight));
  return colors[idx][0];
}

function rollBoost(color: CardColor): number {
  const { boostMin, boostMax } = CARD_COLORS[color];
  return boostMin + Math.floor(Math.random() * (boostMax - boostMin + 1));
}

export type PackCandidate = {
  playerId: number;
  positionGroup: PositionGroup;
  color: CardColor | null;
  boost: number;
};

/**
 * Rolls CANDIDATES_PER_POSITION (5) candidates, all from the one position
 * group the player chose when buying the pack — a rating band first
 * (pack-tier-weighted), then a random real player from that band+group,
 * then an independent enhanced-color/boost roll per card.
 */
export async function generatePackCandidates(
  tierOrKey: string | PackTierConfig,
  group: PositionGroup,
  /** Players already on this run's squad — excluded so a pack never offers
   *  (and risks re-adding) someone already owned. */
  excludeIds: Set<number> = new Set(),
): Promise<PackCandidate[]> {
  const tier = typeof tierOrKey === "string" ? getPackTier(tierOrKey) : tierOrKey;
  const candidates: PackCandidate[] = [];

  // Each of the CANDIDATES_PER_POSITION slots rolls independently, so
  // without this the same player can land in two slots (especially likely
  // in narrow rating bands with few real players) — track picks made so
  // far (seeded with already-owned players) and exclude them from later
  // rolls.
  const usedIds = new Set<number>(excludeIds);

  for (let i = 0; i < CANDIDATES_PER_POSITION; i++) {
    const bandIdx = weightedRandomIndex(tier.bandWeights);
    const band = RATING_BANDS[bandIdx];
    const where: Prisma.PlayerWhereInput = {
      positionGroup: group,
      overall: { gte: band.min, lte: band.max },
    };
    if (usedIds.size > 0) where.id = { notIn: [...usedIds] };
    const pool = await prisma.player.findMany({
      where,
      orderBy: { overall: "desc" },
      take: 150,
    });
    if (pool.length === 0) continue;
    const player = shuffled(pool)[0];
    usedIds.add(player.id);

    const isEnhanced = Math.random() < tier.enhancedChance;
    const color = isEnhanced ? rollColor() : null;
    const boost = color ? rollBoost(color) : 0;

    candidates.push({ playerId: player.id, positionGroup: group, color, boost });
  }

  return candidates;
}

/** Real coach ratings run 70–93 (see `REAL_PL_COACHES`) — a much narrower
 *  band than players, so coach packs reuse the same tier `bandWeights`
 *  shape against this narrower range instead of the 1–99 player bands. */
const COACH_RATING_BANDS = [
  { min: 70, max: 76 },
  { min: 77, max: 81 },
  { min: 82, max: 86 },
  { min: 87, max: 93 },
] as const;

export type CoachCandidate = {
  name: string;
  club: string;
  clubId: number;
  rating: number;
};

/** `PackOpening.candidates` stores one of these, JSON-encoded — a "kind"
 *  discriminator instead of a separate DB column, since it's just a shape
 *  the two buy flows (player slot vs. coach slot) agree on. */
export type PackOpeningPayload =
  | { kind: "player"; positionGroup: PositionGroup; items: PackCandidate[] }
  | { kind: "coach"; items: CoachCandidate[] };

/** Coach packs draw from the same fixed 20-coach real pool every time (no
 *  DB query needed) — a rating band first (pack-tier-weighted, same odds
 *  shape as player packs), then a random real coach from that band, falling
 *  back to any not-yet-used coach if the band's empty at this tier's odds. */
export function generateCoachPackCandidates(tierOrKey: string | PackTierConfig): CoachCandidate[] {
  const tier = typeof tierOrKey === "string" ? getPackTier(tierOrKey) : tierOrKey;
  const pool = realPremierLeagueCoachPool();
  const used = new Set<string>();
  const result: CoachCandidate[] = [];

  for (let i = 0; i < CANDIDATES_PER_POSITION; i++) {
    const bandIdx = weightedRandomIndex(tier.bandWeights);
    const band = COACH_RATING_BANDS[bandIdx];
    const inBand = pool.filter((c) => c.rating >= band.min && c.rating <= band.max && !used.has(c.name));
    const fallback = pool.filter((c) => !used.has(c.name));
    const choices = inBand.length > 0 ? inBand : fallback;
    if (choices.length === 0) continue;
    const coach = shuffled(choices)[0];
    used.add(coach.name);
    result.push(coach);
  }

  return result;
}

/** Applies a card's boost to the real player's overall/potential and, for
 *  the formation pitch's stat row, its six-stat spread. The six sub-stats
 *  stay capped at 99 (the genre's usual "max stat" ceiling — a single
 *  attribute reading "104 PAC" looks like a bug, not a chase card), but
 *  overall/potential are deliberately uncapped: Flashback's +8 on an
 *  already-elite real player (mid-90s base) is meant to be able to break
 *  100 — that's the whole point of the rarest tier existing. */
export function applyCardBoost<
  T extends {
    overall: number;
    potential: number;
    pace: number;
    shooting: number;
    passing: number;
    dribbling: number;
    defending: number;
    physic: number;
    goalkeepingDiving: number;
    goalkeepingHandling: number;
    goalkeepingKicking: number;
    goalkeepingReflexes: number;
    goalkeepingPositioning: number;
  },
>(player: T, boost: number): T {
  if (boost === 0) return player;
  const capStat = (v: number) => Math.min(99, v + boost);
  return {
    ...player,
    overall: player.overall + boost,
    potential: player.potential + boost,
    pace: capStat(player.pace),
    shooting: capStat(player.shooting),
    passing: capStat(player.passing),
    dribbling: capStat(player.dribbling),
    defending: capStat(player.defending),
    physic: capStat(player.physic),
    goalkeepingDiving: capStat(player.goalkeepingDiving),
    goalkeepingHandling: capStat(player.goalkeepingHandling),
    goalkeepingKicking: capStat(player.goalkeepingKicking),
    goalkeepingReflexes: capStat(player.goalkeepingReflexes),
    goalkeepingPositioning: capStat(player.goalkeepingPositioning),
  };
}

/** How many more players (any position) this run's squad can still hold. */
export function remainingCapacity(currentSquadSize: number): number {
  return Math.max(0, SQUAD_SIZE - currentSquadSize);
}

