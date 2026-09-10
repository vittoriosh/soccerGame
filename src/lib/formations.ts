import type { PositionGroup } from "./positions";

/**
 * A formation is the spine of the whole game now: it's chosen once at setup,
 * locked for the draft, and it decides both WHICH eleven roles you're
 * competing to fill and how much each of them is worth to your final
 * rating. Every starting slot carries identical weight, so the shape itself
 * is the strategic choice — a back five spends 45% of your rating on
 * defenders, a 4-2-3-1 spends 36% on attack.
 */
export const SLOT_CODES = [
  "GK",
  "LB",
  "CB",
  "RB",
  "LWB",
  "RWB",
  "CDM",
  "CM",
  "CAM",
  "LM",
  "RM",
  "LW",
  "RW",
  "ST",
  "CF",
] as const;
export type SlotCode = (typeof SLOT_CODES)[number];

const GROUP_BY_SLOT: Record<SlotCode, PositionGroup> = {
  GK: "GK",
  LB: "DEF",
  CB: "DEF",
  RB: "DEF",
  LWB: "DEF",
  RWB: "DEF",
  CDM: "MID",
  CM: "MID",
  CAM: "MID",
  LM: "MID",
  RM: "MID",
  LW: "FWD",
  RW: "FWD",
  ST: "FWD",
  CF: "FWD",
};

export type FormationSlot = {
  /** Unique within a formation — `CB1`/`CB2` share a code but not an id. */
  id: string;
  code: SlotCode;
  group: PositionGroup;
  /** Pitch coordinates in percent: x 0=left, y 0=attacking end. */
  x: number;
  y: number;
};

export type Formation = {
  key: string;
  name: string;
  /** One-line read on what the shape asks of you. */
  blurb: string;
  slots: FormationSlot[];
};

function slots(
  defs: [code: SlotCode, x: number, y: number][],
): FormationSlot[] {
  const seen = new Map<SlotCode, number>();
  return defs.map(([code, x, y]) => {
    const sameCode = defs.filter((d) => d[0] === code).length;
    const n = (seen.get(code) ?? 0) + 1;
    seen.set(code, n);
    return {
      id: sameCode > 1 ? `${code}${n}` : code,
      code,
      group: GROUP_BY_SLOT[code],
      x,
      y,
    };
  });
}

export const FORMATIONS: Formation[] = [
  {
    key: "4-3-3",
    name: "4-3-3",
    blurb: "Balanced. Wingers carry the attack.",
    slots: slots([
      ["GK", 50, 94],
      ["LB", 12, 71],
      ["CB", 35, 77],
      ["CB", 65, 77],
      ["RB", 88, 71],
      ["CDM", 50, 52],
      ["CM", 27, 44],
      ["CM", 73, 44],
      ["LW", 15, 17],
      ["ST", 50, 9],
      ["RW", 85, 17],
    ]),
  },
  {
    key: "4-4-2",
    name: "4-4-2",
    blurb: "Two banks of four, two strikers.",
    slots: slots([
      ["GK", 50, 94],
      ["LB", 12, 71],
      ["CB", 35, 77],
      ["CB", 65, 77],
      ["RB", 88, 71],
      ["LM", 12, 45],
      ["CM", 37, 49],
      ["CM", 63, 49],
      ["RM", 88, 45],
      ["ST", 37, 11],
      ["ST", 63, 11],
    ]),
  },
  {
    key: "4-2-3-1",
    name: "4-2-3-1",
    blurb: "Double pivot behind a creative three.",
    slots: slots([
      ["GK", 50, 94],
      ["LB", 12, 71],
      ["CB", 35, 77],
      ["CB", 65, 77],
      ["RB", 88, 71],
      ["CDM", 35, 57],
      ["CDM", 65, 57],
      ["LW", 14, 29],
      ["CAM", 50, 33],
      ["RW", 86, 29],
      ["ST", 50, 8],
    ]),
  },
  {
    key: "3-5-2",
    name: "3-5-2",
    blurb: "Midfield overload, three at the back.",
    slots: slots([
      ["GK", 50, 94],
      ["CB", 25, 76],
      ["CB", 50, 79],
      ["CB", 75, 76],
      ["LM", 8, 47],
      ["CM", 30, 45],
      ["CDM", 50, 58],
      ["CM", 70, 45],
      ["RM", 92, 47],
      ["ST", 37, 11],
      ["ST", 63, 11],
    ]),
  },
  {
    key: "5-3-2",
    name: "5-3-2",
    blurb: "Back five with wing-backs. Hard to break.",
    slots: slots([
      ["GK", 50, 94],
      ["LWB", 7, 62],
      ["CB", 28, 79],
      ["CB", 50, 81],
      ["CB", 72, 79],
      ["RWB", 93, 62],
      ["CM", 28, 46],
      ["CM", 50, 49],
      ["CM", 72, 46],
      ["ST", 37, 11],
      ["ST", 63, 11],
    ]),
  },
];

export const DEFAULT_FORMATION_KEY = "4-3-3";

export function getFormation(key: string | null | undefined): Formation {
  return (
    FORMATIONS.find((f) => f.key === key) ??
    FORMATIONS.find((f) => f.key === DEFAULT_FORMATION_KEY)!
  );
}

/** Every formation fields eleven; the four remaining picks are bench. */
export const STARTER_SLOTS = 11;

/**
 * Codes a player can cover in a slot without really being out of position —
 * a left-back covering left wing-back, a centre-mid dropping to the pivot.
 * Deliberately narrow: this is the difference between "fine" and "costs you
 * rating", so it only lists genuinely interchangeable roles.
 */
const NATURAL_ALTERNATIVES: Record<SlotCode, SlotCode[]> = {
  GK: [],
  LB: ["LWB"],
  CB: [],
  RB: ["RWB"],
  LWB: ["LB"],
  RWB: ["RB"],
  CDM: ["CM"],
  CM: ["CDM", "CAM"],
  CAM: ["CM"],
  LM: ["LW"],
  RM: ["RW"],
  LW: ["LM"],
  RW: ["RM"],
  ST: ["CF"],
  CF: ["ST"],
};

/** Lines that at least share a touchline or a half — DEF/MID and MID/FWD. */
const ADJACENT_GROUPS: Record<PositionGroup, PositionGroup[]> = {
  GK: [],
  DEF: ["MID"],
  MID: ["DEF", "FWD"],
  FWD: ["MID"],
};

export const FIT_TIERS = ["exact", "natural", "reasonable", "outOfPosition", "emergency"] as const;
export type Fit = (typeof FIT_TIERS)[number];

/** Rating points a player loses for being played away from their role. */
export const FIT_RATING_PENALTY: Record<Fit, number> = {
  exact: 0,
  natural: -1,
  reasonable: -4,
  outOfPosition: -9,
  emergency: -20,
};

/**
 * Position fit also moves chemistry, not just rating — a player in their
 * real role settles in and lifts the players around them; one shoved into a
 * foreign role never clicks no matter how many countrymen surround him.
 */
export const FIT_CHEMISTRY_MOD: Record<Fit, number> = {
  exact: 2,
  natural: 0.5,
  reasonable: -1.5,
  outOfPosition: -3.5,
  emergency: -6,
};

export const FIT_LABELS: Record<Fit, string> = {
  exact: "Natural",
  natural: "Comfortable",
  reasonable: "Adapting",
  outOfPosition: "Out of position",
  emergency: "Emergency",
};

export function parsePositions(positions: string): SlotCode[] {
  return positions
    .split(",")
    .map((p) => p.trim().toUpperCase())
    .filter((p): p is SlotCode => (SLOT_CODES as readonly string[]).includes(p));
}

function groupOf(code: SlotCode): PositionGroup {
  return GROUP_BY_SLOT[code];
}

/**
 * How well a player covers a given slot. A goalkeeper is a hard wall in
 * both directions — nothing else can keep goal and a keeper is useless
 * outfield — so those pairings drop straight to `emergency`.
 */
export function positionFit(positions: string, slotCode: SlotCode): Fit {
  const codes = parsePositions(positions);
  if (codes.length === 0) return "outOfPosition";
  if (codes.includes(slotCode)) return "exact";

  const slotGroup = groupOf(slotCode);
  const playerGroups = new Set(codes.map(groupOf));
  if (slotGroup === "GK" || playerGroups.has("GK")) return "emergency";

  if (codes.some((c) => NATURAL_ALTERNATIVES[slotCode].includes(c))) return "natural";
  if (playerGroups.has(slotGroup)) return "reasonable";
  if (ADJACENT_GROUPS[slotGroup].some((g) => playerGroups.has(g))) return "outOfPosition";
  return "emergency";
}

/**
 * The three nearest slots to each slot on the pitch. Chemistry links count
 * for more between players who actually play near each other, so a back
 * four of real teammates is worth more than four teammates scattered
 * across the XI.
 */
export function slotNeighbours(formation: Formation): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const slot of formation.slots) {
    const nearest = formation.slots
      .filter((s) => s.id !== slot.id)
      .map((s) => ({ id: s.id, d: (s.x - slot.x) ** 2 + (s.y - slot.y) ** 2 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
      .map((s) => s.id);
    map.set(slot.id, new Set(nearest));
  }
  return map;
}

export type SlotAssignable = {
  id: number;
  positions: string;
  overall: number;
};

/**
 * Places a squad into a formation, honouring slots that were explicitly
 * chosen and greedily filling the rest by best fit (highest-rated player
 * first). Explicit assignment is how the game is played now, but drafts
 * created before slots existed — and CPU squads mid-migration — still need
 * a sane XI, and the CPU reuses this to evaluate hypothetical squads.
 */
export function assignSquadToFormation<T extends SlotAssignable>(
  picks: { player: T; slotId?: string | null }[],
  formation: Formation,
): { starters: Map<string, T>; bench: T[] } {
  const starters = new Map<string, T>();
  const slotById = new Map(formation.slots.map((s) => [s.id, s]));
  const unplaced: T[] = [];

  for (const pick of picks) {
    if (pick.slotId && slotById.has(pick.slotId) && !starters.has(pick.slotId)) {
      starters.set(pick.slotId, pick.player);
    } else if (pick.slotId === null || pick.slotId === undefined) {
      unplaced.push(pick.player);
    } else {
      // Slot taken or unknown (formation changed under an old draft) — treat
      // as unassigned rather than dropping the player entirely.
      unplaced.push(pick.player);
    }
  }

  const openSlots = formation.slots.filter((s) => !starters.has(s.id));
  const queue = [...unplaced].sort((a, b) => b.overall - a.overall);
  const bench: T[] = [];

  for (const player of queue) {
    let bestSlot: FormationSlot | null = null;
    let bestRank = Number.POSITIVE_INFINITY;
    for (const slot of openSlots) {
      if (starters.has(slot.id)) continue;
      const rank = FIT_TIERS.indexOf(positionFit(player.positions, slot.code));
      if (rank < bestRank) {
        bestRank = rank;
        bestSlot = slot;
      }
    }
    if (bestSlot && bestRank <= FIT_TIERS.indexOf("outOfPosition")) {
      starters.set(bestSlot.id, player);
    } else {
      bench.push(player);
    }
  }

  // An unfilled slot costs far more than a badly-fitting one, so anyone
  // still on the bench gets pressed into whatever is left over.
  for (const slot of formation.slots) {
    if (starters.has(slot.id) || bench.length === 0) continue;
    let bestIdx = 0;
    let bestRank = Number.POSITIVE_INFINITY;
    bench.forEach((player, i) => {
      const rank = FIT_TIERS.indexOf(positionFit(player.positions, slot.code));
      if (rank < bestRank) {
        bestRank = rank;
        bestIdx = i;
      }
    });
    starters.set(slot.id, bench[bestIdx]);
    bench.splice(bestIdx, 1);
  }

  return { starters, bench };
}
