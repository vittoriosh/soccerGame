export const POSITION_GROUPS = ["GK", "DEF", "MID", "FWD"] as const;
export type PositionGroup = (typeof POSITION_GROUPS)[number];

const GROUP_BY_CODE: Record<string, PositionGroup> = {
  GK: "GK",
  CB: "DEF",
  RB: "DEF",
  LB: "DEF",
  RWB: "DEF",
  LWB: "DEF",
  CDM: "MID",
  CM: "MID",
  CAM: "MID",
  RM: "MID",
  LM: "MID",
  RW: "FWD",
  LW: "FWD",
  CF: "FWD",
  ST: "FWD",
};

const GROUP_LABELS: Record<PositionGroup, string> = {
  GK: "Goalkeepers",
  DEF: "Defenders",
  MID: "Midfielders",
  FWD: "Forwards",
};

/**
 * Starting XI shape (4-3-3): 1 GK, 4 DEF, 3 MID, 3 FWD = 11. Once every
 * group hits its cap, the remaining 4 of the 15 player picks are bench —
 * any position, no cap. Forces a team to fill every line before stacking
 * one, and forces genuine draft decisions (an elite keeper competes with
 * an elite striker for very different slots, not the same one).
 */
export const STARTER_CAPS: Record<PositionGroup, number> = {
  GK: 1,
  DEF: 4,
  MID: 3,
  FWD: 3,
};
export const STARTER_TOTAL = Object.values(STARTER_CAPS).reduce(
  (sum, n) => sum + n,
  0,
);

export function primaryPositionGroup(positions: string): PositionGroup {
  const primary = positions.split(",")[0]?.trim();
  return GROUP_BY_CODE[primary] ?? "MID";
}

export function groupLabel(group: PositionGroup) {
  return GROUP_LABELS[group];
}

export function groupByPosition<T extends { positions: string }>(
  items: T[],
): Record<PositionGroup, T[]> {
  const grouped: Record<PositionGroup, T[]> = {
    GK: [],
    DEF: [],
    MID: [],
    FWD: [],
  };
  for (const item of items) {
    grouped[primaryPositionGroup(item.positions)].push(item);
  }
  return grouped;
}
