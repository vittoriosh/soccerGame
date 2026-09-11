import {
  FIT_RATING_PENALTY,
  positionFit,
  type Formation,
  type FormationSlot,
} from "./formations";
import {
  COACH_WEIGHT,
  benchSlotWeight,
  computeSquadRating,
  starterSlotWeight,
} from "./team-rating";
import { applyCoachChemistryBoost, computeSquadChemistry } from "./chemistry";
import { DEFAULT_SCORING_RULES, type ScoringRules } from "./scoring-rules";

/**
 * "What was the best team I could actually have drafted?"
 *
 * Answered with perfect hindsight but honest constraints: rival picks are
 * taken as they really happened, so a player is only yours to take if he
 * was still on the board when one of YOUR picks came round. That's what
 * makes the number meaningful — it isn't "the best fifteen players in the
 * league", it's the best fifteen that your draft slot could have reached.
 */
export type PoolPlayer = {
  id: number;
  name: string;
  overall: number;
  potential: number;
  age: number;
  positions: string;
  club: string;
  clubId: number | null;
  league: string;
  nationality: string;
  imageUrl: string;
  /**
   * The pick number at which a rival took this player — so he's reachable
   * from any of your picks BEFORE it. Infinity for anyone no rival ever
   * took (including your own picks: had you passed, nobody else was going
   * to take them in this replay).
   */
  deadline: number;
};

export type PoolCoach = {
  id: number;
  name: string;
  club: string;
  clubId: number | null;
  rating: number;
  deadline: number;
};

type Choice =
  | { kind: "slot"; slot: FormationSlot; player: PoolPlayer }
  | { kind: "bench"; index: number; player: PoolPlayer }
  | { kind: "coach"; coach: PoolCoach };

/** How many alternatives per slot the improvement pass reconsiders. Deep
 *  enough to find a chemistry-driven swap, shallow enough to stay fast. */
const CANDIDATES_PER_ITEM = 70;
/** The bench shortlist runs deeper: the top names are all gone to the XI or
 *  to rivals, and a bench pick left empty would understate the ideal. */
const BENCH_CANDIDATE_DEPTH = 200;
const IMPROVEMENT_PASSES = 4;

function choiceDeadline(choice: Choice): number {
  return choice.kind === "coach" ? choice.coach.deadline : choice.player.deadline;
}

/**
 * Could this exact set of players have been assembled from these pick
 * numbers? Earliest-deadline-first is the optimal assignment, so sorting
 * both sides and comparing pairwise settles it (Hall's condition): the
 * i-th most urgent player has to still be on the board at your i-th pick.
 */
function isReachable(choices: Choice[], userPicks: number[]): boolean {
  if (choices.length > userPicks.length) return false;
  const deadlines = choices.map(choiceDeadline).sort((a, b) => a - b);
  for (let i = 0; i < deadlines.length; i++) {
    if (deadlines[i] <= userPicks[i]) return false;
  }
  return true;
}

/** Static, chemistry-free worth of one candidate in one role, in the same
 *  rating-point currency the CPU uses — so slots, bench and coach compete
 *  on one scale during the opening greedy pass. */
function staticValue(
  choice: Choice,
  rules: ScoringRules,
  starterCount: number,
  benchSlots: number,
): number {
  if (choice.kind === "coach") return rules.coach ? COACH_WEIGHT * choice.coach.rating : 0;
  if (choice.kind === "bench") {
    return benchSlotWeight(benchSlots) * choice.player.overall;
  }
  const fit = positionFit(choice.player.positions, choice.slot.code);
  const penalty = rules.fit ? FIT_RATING_PENALTY[fit] : 0;
  return starterSlotWeight(starterCount) * (choice.player.overall + penalty);
}

function ratePlan(
  choices: Choice[],
  formation: Formation,
  rules: ScoringRules,
): { rating: number; chemistry: Map<number, number> } {
  const starters = new Map<string, PoolPlayer>();
  const bench: PoolPlayer[] = [];
  let coachRating: number | undefined;

  for (const choice of choices) {
    if (choice.kind === "slot") starters.set(choice.slot.id, choice.player);
    else if (choice.kind === "bench") bench.push(choice.player);
    else coachRating = choice.coach.rating;
  }

  const slotByPlayer = new Map<number, string>();
  for (const [slotId, player] of starters) slotByPlayer.set(player.id, slotId);

  const chemistry = applyCoachChemistryBoost(
    computeSquadChemistry(
      [...starters.values(), ...bench].map((p) => ({
        id: p.id,
        club: p.club,
        league: p.league,
        nationality: p.nationality,
        positions: p.positions,
        slotId: slotByPlayer.get(p.id) ?? null,
      })),
      formation,
    ),
    rules.coach ? coachRating : undefined,
  );

  const result = computeSquadRating({
    formation,
    starters,
    bench,
    chemistry,
    coachRating,
    rules,
  });
  return { rating: result.rating, chemistry };
}

export type HindsightResult = {
  rating: number;
  starters: Map<string, PoolPlayer>;
  bench: PoolPlayer[];
  coach: PoolCoach | null;
  chemistry: Map<number, number>;
};

/**
 * Builds the best reachable squad in two stages: a greedy first pass that
 * grabs the highest-value reachable (role, player) pairing available, then
 * repeated improvement passes that re-test every role against its best
 * alternatives using the REAL team rating — which is where chemistry and
 * position fit get to override raw ability, exactly as they do in the game.
 */
export function bestPossibleSquad({
  formation,
  userPicks,
  players,
  coaches,
  benchSlots,
  rules = DEFAULT_SCORING_RULES,
}: {
  formation: Formation;
  /** Your pick numbers, ascending. */
  userPicks: number[];
  players: PoolPlayer[];
  coaches: PoolCoach[];
  benchSlots: number;
  rules?: ScoringRules;
}): HindsightResult | null {
  if (userPicks.length === 0 || players.length === 0) return null;
  const picks = [...userPicks].sort((a, b) => a - b);

  // Per-role shortlists, best-first — every later stage draws from these.
  const slotCandidates = new Map<string, PoolPlayer[]>();
  for (const slot of formation.slots) {
    const ranked = [...players]
      .map((player) => ({
        player,
        value: player.overall + (rules.fit ? FIT_RATING_PENALTY[positionFit(player.positions, slot.code)] : 0),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, CANDIDATES_PER_ITEM)
      .map((c) => c.player);
    slotCandidates.set(slot.id, ranked);
  }
  const byOverall = [...players].sort((a, b) => b.overall - a.overall);
  const benchCandidates = byOverall.slice(0, BENCH_CANDIDATE_DEPTH);
  const coachCandidates = [...coaches].sort((a, b) => b.rating - a.rating);

  // --- Stage 1: greedy over every (role, candidate) pairing at once, so a
  // scarce elite keeper isn't crowded out by whichever slot happened to be
  // considered first.
  const options: Choice[] = [];
  for (const slot of formation.slots) {
    for (const player of slotCandidates.get(slot.id) ?? []) {
      options.push({ kind: "slot", slot, player });
    }
  }
  for (const player of benchCandidates) {
    options.push({ kind: "bench", index: 0, player });
  }
  if (rules.coach) {
    for (const coach of coachCandidates) {
      options.push({ kind: "coach", coach });
    }
  }
  options.sort(
    (a, b) =>
      staticValue(b, rules, formation.slots.length, benchSlots) -
      staticValue(a, rules, formation.slots.length, benchSlots),
  );

  const chosen: Choice[] = [];
  const usedPlayers = new Set<number>();
  const filledSlots = new Set<string>();
  let benchFilled = 0;
  let hasCoach = false;

  for (const option of options) {
    if (chosen.length >= picks.length) break;
    if (option.kind === "coach") {
      if (hasCoach) continue;
    } else {
      if (usedPlayers.has(option.player.id)) continue;
      if (option.kind === "slot" && filledSlots.has(option.slot.id)) continue;
      if (option.kind === "bench" && benchFilled >= benchSlots) continue;
    }

    const candidate: Choice =
      option.kind === "bench" ? { ...option, index: benchFilled } : option;
    if (!isReachable([...chosen, candidate], picks)) continue;

    chosen.push(candidate);
    if (candidate.kind === "coach") hasCoach = true;
    else {
      usedPlayers.add(candidate.player.id);
      if (candidate.kind === "slot") filledSlots.add(candidate.slot.id);
      else benchFilled++;
    }
  }

  if (chosen.length === 0) return null;

  // Top-up: the shortlists can run dry of reachable names before the bench
  // is full, and a wasted pick isn't part of anyone's ideal draft. Fall back
  // to the whole pool for whatever is left over.
  if (benchFilled < benchSlots && chosen.length < picks.length) {
    for (const player of byOverall) {
      if (benchFilled >= benchSlots || chosen.length >= picks.length) break;
      if (usedPlayers.has(player.id)) continue;
      const candidate: Choice = { kind: "bench", index: benchFilled, player };
      if (!isReachable([...chosen, candidate], picks)) continue;
      chosen.push(candidate);
      usedPlayers.add(player.id);
      benchFilled++;
    }
  }

  // --- Stage 2: swap each role against its shortlist under the real
  // rating, keeping whatever genuinely helps. Chemistry only shows up here,
  // which is why this pass is what finds the club-stacked squads.
  let best = ratePlan(chosen, formation, rules);
  for (let pass = 0; pass < IMPROVEMENT_PASSES; pass++) {
    let improved = false;

    for (let i = 0; i < chosen.length; i++) {
      const current = chosen[i];
      const alternatives: Choice[] =
        current.kind === "coach"
          ? coachCandidates.map((coach) => ({ kind: "coach" as const, coach }))
          : current.kind === "slot"
            ? (slotCandidates.get(current.slot.id) ?? []).map((player) => ({
                kind: "slot" as const,
                slot: current.slot,
                player,
              }))
            : benchCandidates.map((player) => ({
                kind: "bench" as const,
                index: current.index,
                player,
              }));

      for (const alternative of alternatives) {
        if (alternative.kind === "coach") {
          if (current.kind === "coach" && alternative.coach.id === current.coach.id) continue;
        } else {
          if (usedPlayers.has(alternative.player.id)) continue;
        }

        const trial = [...chosen];
        trial[i] = alternative;
        if (!isReachable(trial, picks)) continue;

        const rated = ratePlan(trial, formation, rules);
        if (rated.rating <= best.rating) continue;

        if (current.kind !== "coach") usedPlayers.delete(current.player.id);
        if (alternative.kind !== "coach") usedPlayers.add(alternative.player.id);
        chosen[i] = alternative;
        best = rated;
        improved = true;
        break;
      }
    }

    if (!improved) break;
  }

  const starters = new Map<string, PoolPlayer>();
  const bench: PoolPlayer[] = [];
  let coach: PoolCoach | null = null;
  for (const choice of chosen) {
    if (choice.kind === "slot") starters.set(choice.slot.id, choice.player);
    else if (choice.kind === "bench") bench.push(choice.player);
    else coach = choice.coach;
  }

  return { rating: best.rating, starters, bench, coach, chemistry: best.chemistry };
}
