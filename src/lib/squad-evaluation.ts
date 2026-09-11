import {
  applyCoachChemistryBoost,
  averageChemistry,
  computeSquadChemistry,
} from "./chemistry";
import { assignSquadToFormation, getFormation } from "./formations";
import type { ScoringRules } from "./scoring-rules";
import {
  computeSquadRating,
  SLOT_NEUTRAL_CHEM,
  type SquadPlayer,
} from "./team-rating";

export type EvaluatedPlayer = SquadPlayer & {
  club: string;
  league: string;
  nationality: string;
};

export type EvaluatedPick<T extends EvaluatedPlayer = EvaluatedPlayer> = {
  slotId: string | null;
  player: T;
};

export function evaluateSquad<T extends EvaluatedPlayer>(
  formationKey: string,
  picks: EvaluatedPick<T>[],
  coachRating: number | undefined,
  rules: ScoringRules,
) {
  const formation = getFormation(formationKey);
  const { starters, bench } = assignSquadToFormation(picks, formation);
  const slotByPlayer = new Map<number, string>();
  for (const [slotId, player] of starters) slotByPlayer.set(player.id, slotId);

  const squadPlayers = [...starters.values(), ...bench];
  const base = computeSquadChemistry(
    squadPlayers.map((player) => ({
      id: player.id,
      club: player.club,
      league: player.league,
      nationality: player.nationality,
      positions: player.positions,
      slotId: slotByPlayer.get(player.id) ?? null,
    })),
    formation,
  );
  const chemistry = rules.chemistry
    ? applyCoachChemistryBoost(base, rules.coach ? coachRating : undefined)
    : new Map(squadPlayers.map((player) => [player.id, SLOT_NEUTRAL_CHEM]));
  const rating = computeSquadRating({
    formation,
    starters,
    bench,
    chemistry,
    coachRating,
    rules,
  });

  return {
    formation,
    starters,
    bench,
    chemistry,
    rating,
    teamChemistry: averageChemistry(chemistry),
  };
}
