export const MIN_DIVISION = 1;
export const MAX_DIVISION = 10;
export const STARTING_DIVISION = 5;
export const SEASON_BAND_SHARE = 0.2;

export type SeasonMovement = "promoted" | "relegated" | "held";

export type SeasonOutcome = {
  movement: SeasonMovement;
  currentDivision: number;
  nextDivision: number;
  bandSize: number;
  promotionMaxRank: number;
  relegationMinRank: number;
  label: string;
};

export type DivisionDifficultyProfile = {
  division: number;
  boardSize: number;
  boardFetch: number;
  scoutingNoiseMultiplier: number;
  /** Blends each CPU's personality toward the rating engine's best answer. */
  strategyBlend: number;
};

export function clampDivision(value: number): number {
  if (!Number.isFinite(value)) return STARTING_DIVISION;
  return Math.max(MIN_DIVISION, Math.min(MAX_DIVISION, Math.round(value)));
}

export function seasonBandSize(teamCount: number): number {
  return Math.max(1, Math.ceil(Math.max(1, teamCount) * SEASON_BAND_SHARE));
}

export function seasonOutcome(
  rank: number,
  teamCount: number,
  division: number,
): SeasonOutcome {
  const currentDivision = clampDivision(division);
  const safeTeamCount = Math.max(1, Math.round(teamCount));
  const safeRank = Math.max(1, Math.min(safeTeamCount, Math.round(rank)));
  const bandSize = seasonBandSize(safeTeamCount);
  const promotionMaxRank = bandSize;
  const relegationMinRank = safeTeamCount - bandSize + 1;

  if (safeRank <= promotionMaxRank && currentDivision > MIN_DIVISION) {
    return {
      movement: "promoted",
      currentDivision,
      nextDivision: currentDivision - 1,
      bandSize,
      promotionMaxRank,
      relegationMinRank,
      label: `Promoted to Division ${currentDivision - 1}`,
    };
  }

  if (safeRank >= relegationMinRank && currentDivision < MAX_DIVISION) {
    return {
      movement: "relegated",
      currentDivision,
      nextDivision: currentDivision + 1,
      bandSize,
      promotionMaxRank,
      relegationMinRank,
      label: `Relegated to Division ${currentDivision + 1}`,
    };
  }

  const boundaryLabel =
    safeRank <= promotionMaxRank && currentDivision === MIN_DIVISION
      ? "Division 1 retained"
      : safeRank >= relegationMinRank && currentDivision === MAX_DIVISION
        ? "Division 10 retained"
        : `Staying in Division ${currentDivision}`;

  return {
    movement: "held",
    currentDivision,
    nextDivision: currentDivision,
    bandSize,
    promotionMaxRank,
    relegationMinRank,
    label: boundaryLabel,
  };
}

/**
 * Division 5 is the existing CPU. Higher divisions see farther into the
 * board, make less noisy evaluations, and progressively converge on the
 * scoring engine's real weights. Lower divisions remain capable but make
 * less consistent decisions. No profile changes player ratings.
 */
const DIFFICULTY: Record<number, Omit<DivisionDifficultyProfile, "division">> = {
  1: { boardSize: 48, boardFetch: 140, scoutingNoiseMultiplier: 0.08, strategyBlend: 1 },
  2: { boardSize: 42, boardFetch: 125, scoutingNoiseMultiplier: 0.25, strategyBlend: 0.78 },
  3: { boardSize: 36, boardFetch: 110, scoutingNoiseMultiplier: 0.45, strategyBlend: 0.55 },
  4: { boardSize: 30, boardFetch: 95, scoutingNoiseMultiplier: 0.7, strategyBlend: 0.28 },
  5: { boardSize: 24, boardFetch: 80, scoutingNoiseMultiplier: 1, strategyBlend: 0 },
  6: { boardSize: 22, boardFetch: 72, scoutingNoiseMultiplier: 1.15, strategyBlend: 0 },
  7: { boardSize: 20, boardFetch: 64, scoutingNoiseMultiplier: 1.35, strategyBlend: 0 },
  8: { boardSize: 18, boardFetch: 56, scoutingNoiseMultiplier: 1.55, strategyBlend: 0 },
  9: { boardSize: 16, boardFetch: 48, scoutingNoiseMultiplier: 1.75, strategyBlend: 0 },
  10: { boardSize: 14, boardFetch: 42, scoutingNoiseMultiplier: 2, strategyBlend: 0 },
};

export function divisionDifficulty(
  division: number,
  enabled: boolean,
): DivisionDifficultyProfile {
  const normalized = enabled ? clampDivision(division) : STARTING_DIVISION;
  return { division: normalized, ...DIFFICULTY[normalized] };
}
