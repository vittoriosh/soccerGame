import { POSITION_GROUPS, type PositionGroup } from "./positions";
import { computeExperienceAdjustment } from "./experience";
import {
  FIT_RATING_PENALTY,
  STARTER_SLOTS,
  positionFit,
  type Fit,
  type Formation,
} from "./formations";
import { DEFAULT_SCORING_RULES, type ScoringRules } from "./scoring-rules";

/**
 * The four outfield lines share most of the weight equally (a weak line
 * drags the team down as much as any other), with a smaller slice reserved
 * for the coach — present but not dominant, since only one coach exists
 * versus eleven-plus players.
 *
 * Coach weight was 0.12 — combined with the coach's chemistry boost
 * (below) and `coachPotentialMultiplier` amplifying every above-neutral
 * player's swing, a top coach compounded through all three channels at
 * once. Simmed across a full 20-team CPU draft, coach rating alone
 * correlated with final team rating at ~0.70, and the single highest-rated
 * coach's team won outright — a much bigger effect than "plays a crucial
 * role" was meant to mean. Trimmed here; the other two channels are
 * trimmed alongside it (chemistry.ts's COACH_BOOST_MAX, and the
 * multiplier's slope below).
 */
export const POSITION_WEIGHTS: Record<PositionGroup, number> = {
  GK: 0.22,
  DEF: 0.22,
  MID: 0.22,
  FWD: 0.22,
};
export const COACH_WEIGHT = 0.08;

/**
 * Chemistry 6/10 is neutral — the floor for a squad drafted entirely from
 * one selected league with no club/nation stacking (BASE 3 + guaranteed
 * league bonus 3). That's the common case, so it costs nothing. Stack real
 * nations or, especially, real clubs on top and a player trends toward —
 * and at the very top with a great coach, slightly exceeds — their
 * potential. Scatter across leagues with no overlap (only possible in a
 * multi-league draft) and chemistry can actually drop below neutral.
 */
const NEUTRAL_CHEM = 6;

/**
 * Formation mode's neutral point sits higher, because playing everyone in
 * their natural position is itself worth +2 chemistry (formations.ts's
 * FIT_CHEMISTRY_MOD). A one-league squad with a correctly-shaped XI and no
 * club/nation stacking therefore lands on 8 — and 8 has to mean "no free
 * boost", or every competently-assembled squad would collect most of its
 * potential gap for nothing. Above 8 is real teammate/nation stacking;
 * below it is players out of position or a squad scattered across leagues.
 */
export const SLOT_NEUTRAL_CHEM = 8;

/** A high-rated coach makes the potential gap easier to close (and, at the
 *  very top end, lets a player exceed potential slightly); a poor coach
 *  simply doesn't help — never a penalty. Slope trimmed alongside
 *  COACH_WEIGHT — see that comment. */
function coachPotentialMultiplier(coachRating: number | undefined): number {
  if (!coachRating) return 1;
  return 1 + Math.max(0, coachRating - 75) / 160;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function computeEffectiveRating(
  overall: number,
  potential: number,
  chem: number,
  coachRating: number | undefined,
  neutral: number = NEUTRAL_CHEM,
  rules: ScoringRules = DEFAULT_SCORING_RULES,
): number {
  const ceiling = rules.potential ? potential : overall;
  const gap = Math.max(0, ceiling - overall);
  const chemUsed = rules.chemistry ? chem : neutral;
  const coachUsed = rules.coach ? coachRating : undefined;
  const factor =
    chemUsed >= neutral
      ? (chemUsed - neutral) / (10 - neutral)
      : (chemUsed - neutral) / neutral; // -1..+1
  const swing =
    factor > 0 ? factor * gap * coachPotentialMultiplier(coachUsed) : factor * gap;
  const effective = overall + swing;
  return Math.max(1, Math.min(99, Math.round(effective)));
}

type RatedItem = { player: { id: number; overall: number; potential: number; age: number } };

export type LineBreakdown = {
  group: PositionGroup;
  rawAvg: number;
  effectiveAvg: number;
  weight: number;
};

/**
 * The single team rating: each line's average effective rating (overall,
 * pulled toward potential by chemistry+coach, or slightly below it by poor
 * chemistry), weighted equally across GK/DEF/MID/FWD plus a coach slice,
 * then adjusted for squad age balance.
 *
 * Also returns the ingredients (`lines`, `chemCoachSwing`) needed to show
 * where that number actually came from — which lines are carrying the team
 * vs dragging it down, and how much chemistry/coach quality is adding or
 * costing on top of raw player ability.
 */
export function computeUnifiedRating(
  squadByPosition: Record<PositionGroup, RatedItem[]>,
  chemistry: Map<number, number>,
  coachRating: number | undefined,
) {
  let score = 0;
  let swingScore = 0;
  const allPlayers: RatedItem["player"][] = [];
  const lines: LineBreakdown[] = [];

  for (const group of POSITION_GROUPS) {
    const items = squadByPosition[group];
    for (const item of items) allPlayers.push(item.player);
    const effectives = items.map((i) =>
      computeEffectiveRating(
        i.player.overall,
        i.player.potential,
        chemistry.get(i.player.id) ?? 0,
        coachRating,
      ),
    );
    const rawAvg = average(items.map((i) => i.player.overall));
    const effectiveAvg = average(effectives);
    lines.push({ group, rawAvg, effectiveAvg, weight: POSITION_WEIGHTS[group] });
    score += POSITION_WEIGHTS[group] * effectiveAvg;
    swingScore += POSITION_WEIGHTS[group] * (effectiveAvg - rawAvg);
  }

  score += COACH_WEIGHT * (coachRating ?? 0);

  const experience = computeExperienceAdjustment(allPlayers);
  score += experience.delta;

  return {
    // One decimal place, not a rounded integer — close teams (a common
    // case once a snake draft has equalized raw talent) were otherwise
    // showing identical whole-number ratings with no way to tell them
    // apart or see which way a tiny edge actually broke.
    rating: Math.round(Math.max(1, Math.min(99, score)) * 10) / 10,
    experienceLabel: experience.label,
    experienceDelta: experience.delta,
    lines,
    coachRating,
    coachWeight: COACH_WEIGHT,
    chemCoachSwing: Math.round(swingScore * 10) / 10,
  };
}

/**
 * The eleven starting slots share the bulk of the rating EQUALLY — that's
 * what makes the formation itself a strategic choice rather than cosmetic.
 * A 5-3-2 spends 5/11 of its rating on defenders and a 4-2-3-1 spends 4/11
 * on the front four, so the shape you locked in at setup decides which
 * positions you can afford to lose a battle for.
 *
 * The bench keeps a small slice: four picks that can't make the XI still
 * have to be worth making, or the last four rounds are dead time.
 */
const STARTER_SHARE = 0.86;
const BENCH_SHARE = 0.06;

export function starterSlotWeight(starterCount: number): number {
  return STARTER_SHARE / Math.max(1, starterCount);
}

export function benchSlotWeight(benchCount: number): number {
  return BENCH_SHARE / Math.max(1, benchCount);
}

const SLOT_WEIGHT = starterSlotWeight(STARTER_SLOTS);
/** The four bench picks split BENCH_SHARE between them — so a bench pick is
 *  worth roughly a fifth of a starting slot, which is what stops the CPU
 *  from ever taking a backup over a starter. */
export const BENCH_SLOT_WEIGHT = benchSlotWeight(4);

export type SquadPlayer = {
  id: number;
  overall: number;
  potential: number;
  age: number;
  positions: string;
};

export type SlotRating = {
  slotId: string;
  code: string;
  group: PositionGroup;
  player: SquadPlayer | null;
  fit: Fit | null;
  effective: number;
  chemistry: number;
};

/**
 * The single team rating, built slot by slot. Six things move it, none of
 * them able to carry a squad alone:
 *
 *  1. raw ability of whoever is in each of the eleven slots (equal weight)
 *  2. position fit — playing a winger at left-back costs real rating points
 *  3. chemistry, which is itself part links and part position fit
 *  4. the coach, a small fixed slice
 *  5. age balance across the squad
 *  6. bench depth, a small slice for the four non-starters
 *
 * Weights are normalised over whatever is actually filled, so a rating
 * shown mid-draft stays on the same 1-99 scale as a finished squad instead
 * of creeping up from near-zero as slots get filled.
 */
export function computeSquadRating(args: {
  formation: Formation;
  starters: Map<string, SquadPlayer>;
  bench: SquadPlayer[];
  chemistry: Map<number, number>;
  coachRating: number | undefined;
  rules?: ScoringRules;
}) {
  const { formation, starters, bench, chemistry } = args;
  const rules = args.rules ?? DEFAULT_SCORING_RULES;
  const coachRating = rules.coach ? args.coachRating : undefined;

  const slotRatings: SlotRating[] = [];
  const byGroup = new Map<PositionGroup, { raw: number[]; eff: number[] }>();
  for (const group of POSITION_GROUPS) byGroup.set(group, { raw: [], eff: [] });

  let score = 0;
  let weight = 0;
  let swing = 0;
  let fitCost = 0;
  const slotWeight = starterSlotWeight(formation.slots.length);

  for (const slot of formation.slots) {
    const player = starters.get(slot.id) ?? null;
    if (!player) {
      slotRatings.push({
        slotId: slot.id,
        code: slot.code,
        group: slot.group,
        player: null,
        fit: null,
        effective: 0,
        chemistry: 0,
      });
      continue;
    }

    const fit = positionFit(player.positions, slot.code);
    const penalty = rules.fit ? FIT_RATING_PENALTY[fit] : 0;
    const chem = rules.chemistry ? (chemistry.get(player.id) ?? 0) : SLOT_NEUTRAL_CHEM;
    // The penalty hits potential as well as overall — otherwise great
    // chemistry would quietly refund a misplacement by pulling the player
    // back up to an untouched ceiling.
    const effective = computeEffectiveRating(
      Math.max(1, player.overall + penalty),
      Math.max(1, player.potential + penalty),
      chem,
      coachRating,
      SLOT_NEUTRAL_CHEM,
      rules,
    );

    score += slotWeight * effective;
    weight += slotWeight;
    swing += slotWeight * (effective - player.overall);
    fitCost += slotWeight * penalty;

    const bucket = byGroup.get(slot.group)!;
    bucket.raw.push(player.overall);
    bucket.eff.push(effective);

    slotRatings.push({
      slotId: slot.id,
      code: slot.code,
      group: slot.group,
      player,
      fit,
      effective,
      chemistry: chem,
    });
  }

  if (bench.length > 0) {
    const benchEffectives = bench.map((p) =>
      computeEffectiveRating(
        p.overall,
        p.potential,
        rules.chemistry ? (chemistry.get(p.id) ?? 0) : SLOT_NEUTRAL_CHEM,
        coachRating,
        SLOT_NEUTRAL_CHEM,
        rules,
      ),
    );
    score += BENCH_SHARE * average(benchEffectives);
    weight += BENCH_SHARE;
  }

  if (coachRating) {
    score += COACH_WEIGHT * coachRating;
    weight += COACH_WEIGHT;
  }

  const normalised = weight > 0 ? score / weight : 0;

  const squad = [...starters.values(), ...bench];
  const experience = rules.age
    ? computeExperienceAdjustment(squad)
    : { delta: 0, label: "Off" };
  const rating = normalised + experience.delta;

  const lines: LineBreakdown[] = POSITION_GROUPS.map((group) => {
    const bucket = byGroup.get(group)!;
    const slotCount = formation.slots.filter((s) => s.group === group).length;
    return {
      group,
      rawAvg: average(bucket.raw),
      effectiveAvg: average(bucket.eff),
      weight: slotWeight * slotCount,
    };
  }).filter((line) => line.weight > 0);

  return {
    rating: Math.round(Math.max(1, Math.min(99, rating)) * 10) / 10,
    slots: slotRatings,
    lines,
    coachRating,
    coachWeight: COACH_WEIGHT,
    /** How much chemistry, coach and fit are worth on top of raw ability. */
    chemCoachSwing: Math.round((weight > 0 ? swing / weight : 0) * 10) / 10,
    /** Rating given up to misplaced players, normalised like the rating. */
    fitCost: Math.round((weight > 0 ? fitCost / weight : 0) * 10) / 10,
    experienceLabel: experience.label,
    experienceDelta: experience.delta,
    filledSlots: starters.size,
    benchCount: bench.length,
  };
}

/** Rating a single player would carry in a single slot, in isolation — the
 *  unit the CPU (and the draft board's fit badges) compare candidates in. */
export function slotEffectiveRating(
  player: { overall: number; potential: number; positions: string },
  slotCode: string,
  chem: number,
  coachRating: number | undefined,
  rules: ScoringRules = DEFAULT_SCORING_RULES,
): { effective: number; fit: Fit } {
  const fit = positionFit(player.positions, slotCode as Parameters<typeof positionFit>[1]);
  const penalty = rules.fit ? FIT_RATING_PENALTY[fit] : 0;
  return {
    effective: computeEffectiveRating(
      Math.max(1, player.overall + penalty),
      Math.max(1, player.potential + penalty),
      rules.chemistry ? chem : SLOT_NEUTRAL_CHEM,
      rules.coach ? coachRating : undefined,
      SLOT_NEUTRAL_CHEM,
      rules,
    ),
    fit,
  };
}

export { SLOT_WEIGHT };
