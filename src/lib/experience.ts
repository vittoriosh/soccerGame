// Age brackets: 22 and under is still developing ("no experience" flavor),
// 31+ is a veteran. Everything in between (23-30) is "prime" and carries no
// penalty either way — a prime-heavy squad is exactly what you'd want.
const YOUNG_MAX_AGE = 22;
const VETERAN_MIN_AGE = 31;

// All-young-no-veterans is the harsher problem (genuinely no experience
// anywhere in the squad); all-veteran-no-young only costs "flair" — half
// the penalty ceiling. Both trimmed down a notch so age balance nudges the
// final rating rather than swinging it.
const MAX_YOUNG_PENALTY = 6;
const MAX_OLD_PENALTY = 3;

// Age balance is only meaningful once the squad has some shape — a couple
// of early picks shouldn't brand the whole team "ageing" or "inexperienced".
const MIN_SAMPLE_SIZE = 5;

// A young player or two mixed into an otherwise normal squad is completely
// fine — even expected. The penalty only kicks in once one bracket clearly
// dominates *over* the other (their fractions more than this far apart),
// and it ramps up smoothly from there to the max at full dominance (e.g.
// 100% young, 0% veteran). Any veteran presence directly offsets the youth
// penalty (mentorship), and vice versa, rather than needing a separate
// hard cutoff.
//
// Ramping (instead of a hard "fractionYoung >= 50%" gate) matters because a
// hard gate makes one player's age flip the team from 0 penalty straight to
// several rating points of penalty — a cliff that doesn't reflect anything
// real changing in the squad. A ramp means a marginal squad stays close to
// 0 and only a genuinely lopsided squad approaches the max.
const DOMINANCE_FREE_MARGIN = 0.2;

type AgedPlayer = { age: number };

export function computeExperienceAdjustment(players: AgedPlayer[]): {
  delta: number;
  label: string;
} {
  if (players.length < MIN_SAMPLE_SIZE) {
    return { delta: 0, label: "Too early to tell" };
  }

  const fractionYoung =
    players.filter((p) => p.age <= YOUNG_MAX_AGE).length / players.length;
  const fractionVeteran =
    players.filter((p) => p.age >= VETERAN_MIN_AGE).length / players.length;

  const youthDominance = fractionYoung - fractionVeteran; // -1..1
  const veteranDominance = fractionVeteran - fractionYoung; // -1..1
  const ramp = (dominance: number) =>
    Math.min(1, Math.max(0, (dominance - DOMINANCE_FREE_MARGIN) / (1 - DOMINANCE_FREE_MARGIN)));

  const youthSeverity = ramp(youthDominance);
  const veteranSeverity = ramp(veteranDominance);

  if (youthSeverity > 0) {
    return {
      delta: -Math.round(youthSeverity * MAX_YOUNG_PENALTY),
      label: youthSeverity >= 0.5 ? "Inexperienced squad" : "Leaning young",
    };
  }
  if (veteranSeverity > 0) {
    return {
      delta: -Math.round(veteranSeverity * MAX_OLD_PENALTY),
      label: veteranSeverity >= 0.5 ? "Ageing squad, lacks flair" : "Leaning veteran",
    };
  }
  return { delta: 0, label: "Balanced age" };
}
