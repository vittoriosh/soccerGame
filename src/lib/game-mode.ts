export type GameMode = "classic" | "sevens" | "career" | "career11";

export const DEFAULT_GAME_MODE: GameMode = "classic";

export function normalizeGameMode(value: string | null | undefined): GameMode {
  if (value === "sevens") return "sevens";
  if (value === "career") return "career";
  if (value === "career11") return "career11";
  return DEFAULT_GAME_MODE;
}

export function isCareerMode(value: string | null | undefined): boolean {
  const mode = normalizeGameMode(value);
  return mode === "career" || mode === "career11";
}

/** Career 7s shares 7s shapes; Career 11s shares full-size shapes. */
export function formationModeFor(value: string | null | undefined): "classic" | "sevens" {
  const mode = normalizeGameMode(value);
  return mode === "classic" || mode === "career11" ? "classic" : "sevens";
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
    label: "Custom 11s",
    shortLabel: "11s",
    starters: 11,
    bench: 0,
    description: "Eleven starters with your own leagues, years and scoring rules.",
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
  career11: {
    label: "Career 11s",
    shortLabel: "11s",
    starters: 11,
    bench: 0,
    description:
      "A starting XI with no substitutes on the same ten-division career ladder.",
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
  return isCareerMode(value) || normalizeGameMode(value) === "sevens";
}
