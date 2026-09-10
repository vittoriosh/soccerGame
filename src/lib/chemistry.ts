import { FIT_CHEMISTRY_MOD, positionFit, slotNeighbours, type Formation } from "./formations";

// Every pair of squad-mates starts from a low baseline, then earns points
// for each link they actually share — club, league, and nation all stack
// (not "take the best one"), so building on top of an already-guaranteed
// league match still means something.
//
// Since a draft is restricted to the leagues you picked, a shared league is
// often free in a single-league draft (everyone drafted is already in that
// one league) — so it's worth the least there. Shared club is the hard,
// deliberate accomplishment: drafting real-world teammates away from 19+
// competing teams — so it dominates regardless of league count.
const BASE = 3;
const LEAGUE_BONUS = 3;
const CLUB_BONUS = 10;
// A squad that spans multiple leagues gets no free league-match on most of
// its pairs (see the nation comment below) — so two players who are
// genuinely real-world teammates (same club, which also means same league)
// is an even bigger, more deliberate accomplishment there than it already
// is in a single-league squad, and pays out more.
const MULTI_LEAGUE_CLUB_BONUS = 15;

// Nationality is the ONLY chemistry lever that doesn't care about league at
// all — a real player's country follows them across any league they play
// in. A single-league squad already gets a free league-match on every pair,
// so nation only needs to be a modest top-up there. A squad that actually
// spans multiple leagues gets no such freebie — most of its pairs share
// neither club nor league — so nation-stacking has to be able to carry a
// squad on its own there, or building real chemistry across leagues is
// structurally impossible no matter how deliberately you play. Boosting it
// specifically for multi-league squads (rather than raising it everywhere)
// keeps the already-tuned single-league difficulty curve untouched.
const NATION_BONUS = 2;
const MULTI_LEAGUE_NATION_BONUS = 5;

// A highly-rated coach nudges chemistry up a little; a mediocre or bad one
// simply contributes nothing — no downside from a weak coach here. Max
// trimmed from 2 — this stacked with COACH_WEIGHT and
// coachPotentialMultiplier (team-rating.ts) to make coach rating alone
// correlate ~0.70 with final team rating in simulation, effectively
// deciding the winner. All three channels were trimmed together.
const COACH_BOOST_THRESHOLD = 80;
const COACH_BOOST_MAX = 1.2;
const COACH_BOOST_DIVISOR = 6.5;

// A link between two players who actually play next to each other is worth
// more than the same link between a left-back and a right winger — the
// point of choosing WHERE a multi-position player goes is that it changes
// how his links land, not just his own rating. Weights are used as a
// weighted average (not a sum), so a squad with uniform links scores the
// same whatever the weights: emphasis only ever redistributes, never
// inflates. Bench links count for half — squad harmony, not partnership.
const NEIGHBOUR_LINK_WEIGHT = 1.75;
const XI_LINK_WEIGHT = 1;
const BENCH_LINK_WEIGHT = 0.5;

type ChemPlayer = {
  id: number;
  club: string;
  league: string;
  nationality: string;
};

// Deliberately uncapped per pair — a real-club teammate pair (13+) already
// exceeds 10 on its own. That headroom matters once averaged against a
// squad's many non-club pairs (still just league-level, ~6): only a wide,
// genuine club-stacking effort across most of the squad — not one small
// pocket of it — pulls the *team* average up near 9-10. The final average
// is what gets capped at 10, not the individual pair.
function pairScore(a: ChemPlayer, b: ChemPlayer, nationBonus: number, clubBonus: number): number {
  let score = BASE;
  if (a.club && a.club === b.club) score += clubBonus;
  if (a.league && a.league === b.league) score += LEAGUE_BONUS;
  if (a.nationality && a.nationality === b.nationality) score += nationBonus;
  return score;
}

/**
 * Per-player chemistry (0-10) from squad links alone, before any coach
 * boost. A player alone in the squad scores 0 (no teammates to have
 * chemistry with).
 */
export function computePlayerChemistry(
  players: ChemPlayer[],
): Map<number, number> {
  const chem = new Map<number, number>();
  const n = players.length;

  if (n <= 1) {
    for (const p of players) chem.set(p.id, 0);
    return chem;
  }

  const spansMultipleLeagues = new Set(players.map((p) => p.league)).size > 1;
  const nationBonus = spansMultipleLeagues ? MULTI_LEAGUE_NATION_BONUS : NATION_BONUS;
  const clubBonus = spansMultipleLeagues ? MULTI_LEAGUE_CLUB_BONUS : CLUB_BONUS;

  for (const p of players) {
    let total = 0;
    for (const other of players) {
      if (other.id === p.id) continue;
      total += pairScore(p, other, nationBonus, clubBonus);
    }
    const score = Math.round(total / (n - 1));
    chem.set(p.id, Math.max(0, Math.min(10, score)));
  }
  return chem;
}

export type SlottedChemPlayer = ChemPlayer & {
  positions: string;
  /** Formation slot id, or null for a bench player. */
  slotId: string | null;
};

/**
 * Per-player chemistry (0-10) for a squad placed in a formation. Same
 * club/league/nation links as `computePlayerChemistry`, but two things now
 * matter beyond who you drafted:
 *
 *  - WHERE they play: links between neighbouring slots count for more, so a
 *    back four of real teammates beats four teammates scattered across the
 *    XI.
 *  - WHETHER they belong there: a player in his natural role gets a
 *    chemistry bonus, one shoved into a foreign role takes a hit that no
 *    amount of shared club or nation makes up for.
 *
 * Together those are what make a multi-position player's assignment a real
 * decision — the same player is worth different amounts in different slots.
 */
export function computeSquadChemistry(
  players: SlottedChemPlayer[],
  formation: Formation,
): Map<number, number> {
  const chem = new Map<number, number>();
  if (players.length <= 1) {
    for (const p of players) chem.set(p.id, 0);
    return chem;
  }

  const spansMultipleLeagues = new Set(players.map((p) => p.league)).size > 1;
  const nationBonus = spansMultipleLeagues ? MULTI_LEAGUE_NATION_BONUS : NATION_BONUS;
  const clubBonus = spansMultipleLeagues ? MULTI_LEAGUE_CLUB_BONUS : CLUB_BONUS;

  const neighbours = slotNeighbours(formation);
  const slotCodes = new Map(formation.slots.map((s) => [s.id, s.code]));

  function linkWeight(a: SlottedChemPlayer, b: SlottedChemPlayer): number {
    if (!a.slotId || !b.slotId) return BENCH_LINK_WEIGHT;
    return neighbours.get(a.slotId)?.has(b.slotId) ? NEIGHBOUR_LINK_WEIGHT : XI_LINK_WEIGHT;
  }

  for (const p of players) {
    let weighted = 0;
    let weight = 0;
    for (const other of players) {
      if (other.id === p.id) continue;
      const w = linkWeight(p, other);
      weighted += pairScore(p, other, nationBonus, clubBonus) * w;
      weight += w;
    }
    const links = weight > 0 ? weighted / weight : 0;
    const code = p.slotId ? slotCodes.get(p.slotId) : undefined;
    const fitMod = code ? FIT_CHEMISTRY_MOD[positionFit(p.positions, code)] : 0;
    chem.set(p.id, Math.max(0, Math.min(10, Math.round(links + fitMod))));
  }
  return chem;
}

export function coachChemistryBoost(coachRating: number | undefined): number {
  if (!coachRating) return 0;
  return Math.max(
    0,
    Math.min(COACH_BOOST_MAX, (coachRating - COACH_BOOST_THRESHOLD) / COACH_BOOST_DIVISOR),
  );
}

/**
 * Applies the coach's small chemistry boost to every player, capped at 10.
 * Rounded back to a whole number — per-player chemistry is displayed as a
 * compact single value (the formation pitch's chemistry dot), and
 * COACH_BOOST_MAX/DIVISOR aren't chosen to divide evenly, so leaving this
 * unrounded produced ugly long-decimal chemistry values on player cards.
 * `averageChemistry` still shows one decimal at the squad level (averaging
 * 15 whole numbers isn't itself a whole number), just computed from these
 * already-rounded per-player values rather than raw fractional ones.
 */
export function applyCoachChemistryBoost(
  chem: Map<number, number>,
  coachRating: number | undefined,
): Map<number, number> {
  const boost = coachChemistryBoost(coachRating);
  if (boost === 0) return chem;
  const boosted = new Map<number, number>();
  for (const [id, value] of chem) {
    boosted.set(id, Math.round(Math.min(10, value + boost)));
  }
  return boosted;
}

export function averageChemistry(chem: Map<number, number>): number {
  if (chem.size === 0) return 0;
  const values = Array.from(chem.values());
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
  return Math.round(avg * 10) / 10;
}
