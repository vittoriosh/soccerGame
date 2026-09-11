import { PREMIER_LEAGUE, TOP_5_LEAGUES } from "./league-data";

export const MIN_DIVISION = 1;
export const MAX_DIVISION = 10;
export const STARTING_DIVISION = 5;
export const SEASON_BAND_SHARE = 0.2;

const LA_LIGA = "La Liga";
const SERIE_A = "Serie A";

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

/**
 * What a career division actually is: the leagues on the board, how many
 * player-card years get rolled into the pool, and how big the field is.
 * Climbing widens all three at once, so Division 1 is a five-league,
 * three-year, forty-club scramble and Division 10 is one league, one year,
 * eight clubs.
 */
export type DivisionScope = {
  division: number;
  leagues: string[];
  yearCount: number;
  teamCount: number;
};

/**
 * Year counts aren't only flavour — a division has to be able to field its
 * clubs. Premier League + La Liga can only ever supply 40 real clubs from a
 * single season, so the divisions that want 40 or 50 buy their headroom
 * with an extra season rather than a thinner field. Years never decrease on
 * the way up. `scripts/club-supply.ts` proves the floors.
 */
const SCOPE: Record<number, Omit<DivisionScope, "division">> = {
  1: { leagues: TOP_5_LEAGUES, yearCount: 3, teamCount: 100 },
  2: { leagues: TOP_5_LEAGUES, yearCount: 3, teamCount: 80 },
  3: { leagues: [PREMIER_LEAGUE, LA_LIGA, SERIE_A], yearCount: 3, teamCount: 65 },
  // Two leagues across three seasons top out near 55 real clubs, and three
  // seasons is the cap, so Division 4 stops short of 50 rather than field
  // youth sides. Serie A is Division 3's step up, not this one's.
  4: { leagues: [PREMIER_LEAGUE, LA_LIGA], yearCount: 3, teamCount: 45 },
  5: { leagues: [PREMIER_LEAGUE, LA_LIGA], yearCount: 2, teamCount: 40 },
  6: { leagues: [PREMIER_LEAGUE, LA_LIGA], yearCount: 2, teamCount: 30 },
  7: { leagues: [PREMIER_LEAGUE], yearCount: 2, teamCount: 20 },
  8: { leagues: [PREMIER_LEAGUE], yearCount: 1, teamCount: 16 },
  9: { leagues: [PREMIER_LEAGUE], yearCount: 1, teamCount: 12 },
  10: { leagues: [PREMIER_LEAGUE], yearCount: 1, teamCount: 10 },
};

export function divisionScope(division: number): DivisionScope {
  const normalized = clampDivision(division);
  const scope = SCOPE[normalized];
  return {
    division: normalized,
    leagues: [...scope.leagues],
    yearCount: scope.yearCount,
    teamCount: scope.teamCount,
  };
}

export function divisionLeagueLabel(division: number): string {
  const { leagues } = divisionScope(division);
  return leagues.length === TOP_5_LEAGUES.length ? "Top 5 leagues" : leagues.join(" + ");
}

export function divisionScopeLabel(division: number): string {
  const scope = divisionScope(division);
  const years = `${scope.yearCount} random year${scope.yearCount === 1 ? "" : "s"}`;
  return `${divisionLeagueLabel(division)} · ${years} · ${scope.teamCount} clubs`;
}

/** Years are rolled, not chosen — that reveal is part of the season start. */
export function rollDivisionYears(division: number, availableYears: number[]): number[] {
  const { yearCount } = divisionScope(division);
  if (availableYears.length === 0) return [];
  const pool = [...availableYears];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(yearCount, pool.length)).sort((a, b) => b - a);
}
