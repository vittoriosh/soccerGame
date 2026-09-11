export type GameMode = "classic" | "sevens" | "career";

export const DEFAULT_GAME_MODE: GameMode = "classic";

export function normalizeGameMode(value: string | null | undefined): GameMode {
  if (value === "sevens") return "sevens";
  if (value === "career") return "career";
  return DEFAULT_GAME_MODE;
}

/** Career is 7s on a ladder, so it shares every formation and squad rule. */
export function formationModeFor(value: string | null | undefined): "classic" | "sevens" {
  return normalizeGameMode(value) === "classic" ? "classic" : "sevens";
}

export const GAME_MODE_CONFIG: Record<
  GameMode,
  {
    label: string;
    shortLabel: string;
    starters: number;
    bench: number;
    description: string;
  }
> = {
  classic: {
    label: "Classic 11s",
    shortLabel: "11s",
    starters: 11,
    bench: 4,
    description: "The full tactical game: eleven starters and four substitutes.",
  },
  sevens: {
    label: "7s",
    shortLabel: "7s",
    starters: 7,
    bench: 2,
    description: "A faster, tighter draft: seven starters and two substitutes.",
  },
  career: {
    label: "Career 7s",
    shortLabel: "7s",
    starters: 7,
    bench: 2,
    description:
      "7s on a ten-division ladder. Pick a club and a shape — the division sets the leagues, the years and how sharp your rivals are.",
  },
};

export function gameModeConfig(value: string | null | undefined) {
  return GAME_MODE_CONFIG[normalizeGameMode(value)];
}

export function playerPicksForMode(value: string | null | undefined): number {
  const mode = gameModeConfig(value);
  return mode.starters + mode.bench;
}

/** Career always runs the ladder; 7s can opt in; Classic never does. */
export function supportsDivisions(value: string | null | undefined): boolean {
  return normalizeGameMode(value) !== "classic";
}
