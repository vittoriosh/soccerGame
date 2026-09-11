import {
  gameModeConfig,
  playerPicksForMode,
  type GameMode,
} from "./game-mode";

/**
 * Per-draft switches for what actually counts toward the team rating.
 * Chosen once at setup and locked — the CPU, the board, and the final
 * ranking all play by the same set.
 *
 * Existing drafts (pre-toggle) read as every lever on, which is the game
 * as it already was.
 */
export type ScoringRules = {
  chemistry: boolean;
  coach: boolean;
  age: boolean;
  potential: boolean;
  fit: boolean;
};

export const DEFAULT_SCORING_RULES: ScoringRules = {
  chemistry: true,
  coach: true,
  age: true,
  potential: true,
  fit: true,
};

export type ScoringRuleKey = keyof ScoringRules;

export const SCORING_RULE_FIELDS: {
  key: ScoringRuleKey;
  formName: string;
  dbField:
    | "chemistryEnabled"
    | "coachEnabled"
    | "ageEnabled"
    | "potentialEnabled"
    | "fitEnabled";
  label: string;
  blurb: string;
}[] = [
  {
    key: "chemistry",
    formName: "chemistry",
    dbField: "chemistryEnabled",
    label: "Chemistry",
    blurb: "Club, league and nation links — and standing next to teammates — pull players toward potential.",
  },
  {
    key: "coach",
    formName: "coach",
    dbField: "coachEnabled",
    label: "Coach",
    blurb: "One pick, a slice of the rating, plus a squad-wide chemistry and development boost. Off skips the coach round entirely.",
  },
  {
    key: "age",
    formName: "age",
    dbField: "ageEnabled",
    label: "Age balance",
    blurb: "A small tax on all-youth or all-veteran squads. Prime-age players are always free.",
  },
  {
    key: "potential",
    formName: "potential",
    dbField: "potentialEnabled",
    label: "Potential",
    blurb: "Chemistry and a strong coach close the gap between overall and potential. Off rates everyone on current overall only.",
  },
  {
    key: "fit",
    formName: "fit",
    dbField: "fitEnabled",
    label: "Position fit",
    blurb: "Playing someone in their real role earns chemistry and rating; parking them elsewhere costs both.",
  },
];

export function formFlagOn(formData: FormData, name: string): boolean {
  const raw = String(formData.get(name) ?? "1");
  return raw !== "0" && raw !== "false";
}

export function scoringRulesFromForm(formData: FormData): ScoringRules {
  return {
    chemistry: formFlagOn(formData, "chemistry"),
    coach: formFlagOn(formData, "coach"),
    age: formFlagOn(formData, "age"),
    potential: formFlagOn(formData, "potential"),
    fit: formFlagOn(formData, "fit"),
  };
}

export function scoringRulesFromDraft(draft: {
  chemistryEnabled?: boolean | null;
  coachEnabled?: boolean | null;
  ageEnabled?: boolean | null;
  potentialEnabled?: boolean | null;
  fitEnabled?: boolean | null;
}): ScoringRules {
  return {
    chemistry: draft.chemistryEnabled !== false,
    coach: draft.coachEnabled !== false,
    age: draft.ageEnabled !== false,
    potential: draft.potentialEnabled !== false,
    fit: draft.fitEnabled !== false,
  };
}

/** Legacy constants retained for old scripts. Live drafts use mode config. */
export const PLAYER_PICKS_PER_TEAM = 15;
export const BENCH_PICKS = 4;

export function benchPicksForMode(
  gameMode: GameMode | string | null | undefined,
): number {
  return gameModeConfig(gameMode).bench;
}

export function roundsForRules(
  rules: ScoringRules,
  gameMode: GameMode | string | null | undefined = "classic",
): number {
  return playerPicksForMode(gameMode) + (rules.coach ? 1 : 0);
}
