export type GameMode = "classic" | "sevens";

export const DEFAULT_GAME_MODE: GameMode = "classic";

export function normalizeGameMode(value: string | null | undefined): GameMode {
  return value === "sevens" ? "sevens" : DEFAULT_GAME_MODE;
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
};

export function gameModeConfig(value: string | null | undefined) {
  return GAME_MODE_CONFIG[normalizeGameMode(value)];
}

export function playerPicksForMode(value: string | null | undefined): number {
  const mode = gameModeConfig(value);
  return mode.starters + mode.bench;
}
