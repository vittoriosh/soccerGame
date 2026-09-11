import { prisma } from "@/lib/db";
import { POSITION_GROUPS, STARTER_CAPS, STARTER_TOTAL, type PositionGroup } from "@/lib/positions";
import {
  COACH_WEIGHT,
  benchSlotWeight,
  starterSlotWeight,
} from "@/lib/team-rating";
import {
  benchPicksForMode,
  roundsForRules,
  scoringRulesFromDraft,
} from "@/lib/scoring-rules";
import { normalizeGameMode, supportsDivisions } from "@/lib/game-mode";
import {
  divisionDifficulty,
  type DivisionDifficultyProfile,
} from "@/lib/season-divisions";
import {
  FIT_CHEMISTRY_MOD,
  FIT_RATING_PENALTY,
  FIT_TIERS,
  assignSquadToFormation,
  getFormation,
  positionFit,
  slotNeighbours,
  type Formation,
  type FormationSlot,
} from "@/lib/formations";

/** Default rounds when the coach counts: 15 player picks + 1 coach. */
export const ROUNDS = 16;

export function roundsForDraft(draft: {
  chemistryEnabled?: boolean | null;
  coachEnabled?: boolean | null;
  ageEnabled?: boolean | null;
  potentialEnabled?: boolean | null;
  fitEnabled?: boolean | null;
  gameMode?: string | null;
}): number {
  return roundsForRules(scoringRulesFromDraft(draft), draft.gameMode);
}

/** Comma-separated draft.years → number list used in player filters. */
export function parseDraftYears(years: string): number[] {
  return years
    .split(",")
    .map((y) => Number.parseInt(y, 10))
    .filter((y) => Number.isFinite(y));
}

export function pickInfo(pickNumber: number, teamCount: number) {
  const round = Math.ceil(pickNumber / teamCount);
  const posInRound = pickNumber - (round - 1) * teamCount;
  const draftOrder = round % 2 === 1 ? posInRound : teamCount - posInRound + 1;
  return { round, posInRound, draftOrder };
}

export async function draftTotals(draftId: number) {
  const [teamCount, draft] = await Promise.all([
    prisma.team.count({ where: { draftId } }),
    prisma.draft.findUnique({
      where: { id: draftId },
      select: {
        coachEnabled: true,
        chemistryEnabled: true,
        ageEnabled: true,
        potentialEnabled: true,
        fitEnabled: true,
        gameMode: true,
      },
    }),
  ]);
  const rounds = roundsForRules(
    scoringRulesFromDraft(draft ?? {}),
    draft?.gameMode,
  );
  return { teamCount, totalPicks: teamCount * rounds, rounds };
}

export async function getDraftedPlayerIds(draftId: number) {
  const picks = await prisma.draftPick.findMany({
    where: { draftId },
    select: { playerId: true },
  });
  return picks.map((p) => p.playerId);
}

export async function getDraftedCoachIds(draftId: number) {
  const picks = await prisma.coachPick.findMany({
    where: { draftId },
    select: { coachId: true },
  });
  return picks.map((p) => p.coachId);
}

export async function teamHasCoach(draftId: number, teamId: number) {
  const pick = await prisma.coachPick.findFirst({ where: { draftId, teamId } });
  return pick !== null;
}

function emptyCounts(): Record<PositionGroup, number> {
  return { GK: 0, DEF: 0, MID: 0, FWD: 0 };
}

export async function getTeamPositionCounts(draftId: number, teamId: number) {
  const picks = await prisma.draftPick.findMany({
    where: { draftId, teamId },
    include: { player: { select: { positionGroup: true } } },
  });
  const counts = emptyCounts();
  for (const p of picks) {
    counts[p.player.positionGroup as PositionGroup]++;
  }
  return counts;
}

/** Groups still open for a team given its current counts — every group
 *  while still filling the starting XI, all of them once it's complete.
 *  Kept for the packs mode, which still plays by fixed 4-3-3 line caps. */
export function openGroups(counts: Record<PositionGroup, number>): PositionGroup[] {
  const total = POSITION_GROUPS.reduce((sum, g) => sum + counts[g], 0);
  if (total >= STARTER_TOTAL) return [...POSITION_GROUPS];
  return POSITION_GROUPS.filter((g) => counts[g] < STARTER_CAPS[g]);
}

/**
 * Which formation slots a team still has to fill, and what it already has.
 * The starting XI must be completed before anyone goes to the bench — the
 * same rule the old line caps enforced, now expressed in slots — so this is
 * also what tells the draft board whether you're picking a starter or a
 * backup.
 */
export async function getTeamSquadState(draftId: number, teamId: number, formationKey: string) {
  const formation = getFormation(formationKey);
  const picks = await prisma.draftPick.findMany({
    where: { draftId, teamId },
    orderBy: { pickNumber: "asc" },
    select: { slotId: true, player: { select: { id: true, positions: true, overall: true } } },
  });

  // Placement goes through assignSquadToFormation so this agrees exactly
  // with what the draft board shows — including for drafts started before
  // slots existed, whose picks carry no slot of their own and get placed by
  // best fit instead.
  const { starters, bench } = assignSquadToFormation(picks, formation);
  const openSlots = formation.slots.filter((s) => !starters.has(s.id));

  return {
    formation,
    filled: starters,
    openSlots,
    benchCount: bench.length,
    picksMade: picks.length,
    /** Bench picks only start once every slot has a body in it. */
    benchOpen: openSlots.length === 0,
  };
}

// SQLite bounds how many parameters a single query can bind, and a `NOT IN
// (...)` exclusion list blows past that once a draft has run long enough to
// rack up hundreds of picks — Prisma can't auto-split a negation filter
// across queries the way it can a positive `IN`. Fetching a generous buffer
// of top-rated matches with NO id exclusion in SQL, then excluding already
// -taken ids in JS, sidesteps the limit entirely and — inside advanceDraft,
// where this matters most — also correctly excludes picks made earlier in
// the SAME call that haven't been persisted to the DB yet (a relational
// "not drafted in this draft" filter wouldn't see those).
const CANDIDATE_FETCH_BUFFER = 300;
// A late, narrow scope (one position group within one league, say) can have
// almost its entire top end already drafted — a single fixed-size buffer
// isn't always enough to still find `take` survivors. Retry with a bigger
// buffer rather than silently returning too few (which upstream reads as
// "nothing left" and can end a CPU team's turn early). Stops once a fetch
// comes back smaller than requested — that means the DB has no more rows
// matching at all, not just more than fit in this buffer.
const CANDIDATE_FETCH_CAP = 20000;

export async function excludeDrafted<T extends { id: number }>(
  fetch: (take: number) => Promise<T[]>,
  excludeIds: Set<number>,
  take: number,
): Promise<T[]> {
  let fetchTake = Math.min(
    CANDIDATE_FETCH_CAP,
    Math.max(take + excludeIds.size + 80, CANDIDATE_FETCH_BUFFER),
  );
  while (true) {
    const rows = await fetch(fetchTake);
    const filtered = rows.filter((r) => !excludeIds.has(r.id));
    if (filtered.length >= take || rows.length < fetchTake || fetchTake >= CANDIDATE_FETCH_CAP) {
      return filtered.slice(0, take);
    }
    fetchTake = Math.min(CANDIDATE_FETCH_CAP, fetchTake * 4);
  }
}

const CANDIDATE_SELECT = {
  id: true,
  positions: true,
  positionGroup: true,
  overall: true,
  potential: true,
  age: true,
  club: true,
  nationality: true,
  league: true,
} as const;

type Candidate = {
  id: number;
  positions: string;
  positionGroup: string;
  overall: number;
  potential: number;
  age: number;
  club: string;
  nationality: string;
  league: string;
};

// A CPU team keeps a live board per position group rather than re-querying
// the top ten every single pick: one fetch of the group's best undrafted
// players, reused (minus whoever gets taken) until it runs thin. That's
// both far fewer round trips across a 300-pick draft AND a much wider view
// than the pick-by-pick top ten it replaces — the CPU can now see that a
// position is thin three rounds before it runs out.
// Chemistry is measured in chemistry points, the rating is in rating
// points; one chemistry point is worth roughly this much rating through
// computeEffectiveRating's potential pull, so the CPU can add the two up
// instead of comparing incomparable scales.
const CHEM_POINT_VALUE = 0.7;
// Same-club links are the hard, deliberate accomplishment (chemistry.ts),
// and worth chasing harder when a draft spans leagues where a shared league
// isn't free. Nation is the cheaper, always-available lever.
const CLUB_LINK_CHEM = 1.6;
const MULTI_LEAGUE_CLUB_LINK_CHEM = 2.4;
const NATION_LINK_CHEM = 0.4;
const MULTI_LEAGUE_NATION_LINK_CHEM = 1.1;
// A link between neighbouring slots is worth more than the same link across
// the pitch (chemistry.ts's NEIGHBOUR_LINK_WEIGHT), so the CPU prefers
// placing a teammate NEXT TO his real teammate.
const NEIGHBOUR_LINK_MULTIPLIER = 1.6;
// Past this many from one club (or nation), further links stop paying —
// without a cap, integer overalls tie constantly and a flat bonus breaks
// every tie the same way, snowballing a whole squad out of one club.
const CLUB_STACK_CAP = 5;
const NATION_STACK_CAP = 8;
// A keeper at striker is never the answer, whatever the numbers say.
const WORST_ACCEPTABLE_FIT = FIT_TIERS.indexOf("outOfPosition");

/** Deterministic per-team PRNG (mulberry32) — the same team always drafts
 *  with the same temperament, which matters because advanceDraft can run
 *  twice concurrently for one draft and both runs must agree. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Every CPU team drafts to its own temperament, so a twenty-team field
 * doesn't produce twenty identical boards. One club hunts real-teammate
 * chemistry, another buys young players on potential, another just takes
 * the highest number available — and each has slightly different opinions
 * of individual players (`scoutNoise`), which is what makes a player
 * occasionally slide two rounds instead of every team agreeing to the
 * decimal.
 */
type Temperament = {
  chem: number;
  upside: number;
  scoutNoise: number;
  /** How much a team trusts "best available" over filling a scarce slot. */
  patience: number;
};

function temperamentFor(
  teamId: number,
  difficulty: DivisionDifficultyProfile,
): Temperament {
  const r = mulberry32(teamId * 2654435761);
  const personality = {
    chem: 0.35 + r() * 1.5,
    upside: r() * 0.75,
    scoutNoise: 0.4 + r() * 1.4,
    patience: 0.6 + r() * 0.8,
  };
  const focus = difficulty.strategyBlend;
  return {
    chem: personality.chem * (1 - focus) + focus,
    upside: personality.upside * (1 - focus) + 0.55 * focus,
    scoutNoise: personality.scoutNoise * difficulty.scoutingNoiseMultiplier,
    patience: personality.patience * (1 - focus) + focus,
  };
}

/** A team's private, stable opinion of one player — small enough never to
 *  override a real rating gap, big enough to break the constant ties that
 *  integer overalls produce. */
function scoutingOpinion(teamId: number, playerId: number): number {
  const r = mulberry32(teamId * 73856093 + playerId * 19349663);
  return r() - 0.5;
}

type TeamState = {
  id: number;
  draftOrder: number;
  formation: Formation;
  neighbours: Map<string, Set<string>>;
  /** slotId → player already in it. */
  filled: Map<string, Candidate>;
  openSlots: FormationSlot[];
  benchCount: number;
  clubCounts: Map<string, number>;
  nationCounts: Map<string, number>;
  hasCoach: boolean;
  temperament: Temperament;
};

/**
 * Auto-picks for every CPU turn from the draft's current pick until it's
 * the user's turn or the draft is done.
 *
 * Each CPU team now drafts a FORMATION, not a pile of players: it looks at
 * every slot it still has to fill and every player it could put there, and
 * values the pairing the way the final rating actually will —
 *
 *  - position fit (a natural left-back beats a better winger played there)
 *  - chemistry links, worth more between neighbouring slots
 *  - potential, weighted by how much this team likes buying upside
 *  - the slot's share of the team rating (every slot is worth 1/11)
 *
 * Then, crucially, it drafts on SURPLUS rather than on the raw number: a
 * pick is worth what the player gives you *over whoever would still be
 * there at your next turn*. That's what makes it hold off on a deep
 * position and jump early on a thin one, and it puts the coach decision on
 * the same scale — take the great coach now if the ones left at your next
 * pick are much worse, otherwise keep taking players.
 */
export async function advanceDraft(draftId: number) {
  const draft = await prisma.draft.findUniqueOrThrow({ where: { id: draftId } });
  if (draft.status !== "in_progress") return draft;

  const leagues = draft.leagues.split(",");
  const years = parseDraftYears(draft.years);
  const multiLeague = leagues.length > 1;
  const rules = scoringRulesFromDraft(draft);
  const gameMode = normalizeGameMode(draft.gameMode);
  const difficulty = divisionDifficulty(
    draft.division,
    supportsDivisions(gameMode) && draft.divisionsEnabled,
  );
  const benchPicks = benchPicksForMode(gameMode);
  const rounds = roundsForRules(rules, gameMode);
  const teams = await prisma.team.findMany({
    where: { draftId },
    orderBy: { draftOrder: "asc" },
  });
  const teamCount = teams.length;
  const teamByOrder = new Map(teams.map((team) => [team.draftOrder, team]));
  const totalPicks = teamCount * rounds;
  if (draft.currentPick > totalPicks) {
    return prisma.draft.update({
      where: { id: draftId },
      data: { status: "complete" },
    });
  }

  const onTheClock = teams.find(
    (team) => team.draftOrder === pickInfo(draft.currentPick, teamCount).draftOrder,
  );
  // Page load calls this on every render. If it's already the user's turn,
  // skip the heavy board work — otherwise the board hangs after every pick.
  if (!onTheClock || onTheClock.id === draft.userTeamId) return draft;

  const [allPicks, coachPicks, coaches] = await Promise.all([
    prisma.draftPick.findMany({
      where: { draftId },
      orderBy: { pickNumber: "asc" },
      select: { teamId: true, slotId: true, player: { select: CANDIDATE_SELECT } },
    }),
    prisma.coachPick.findMany({
      where: { draftId },
      select: { teamId: true, coachId: true },
    }),
    prisma.coach.findMany({ where: { draftId }, orderBy: { rating: "desc" } }),
  ]);
  const draftedPlayerIds = new Set(allPicks.map((pick) => pick.player.id));
  const draftedCoachIds = new Set(coachPicks.map((pick) => pick.coachId));
  const teamsWithCoach = new Set(coachPicks.map((pick) => pick.teamId));
  const coachBoard = coaches.filter((coach) => !draftedCoachIds.has(coach.id));
  const picksByTeam = new Map<number, typeof allPicks>();
  for (const p of allPicks) {
    if (!picksByTeam.has(p.teamId)) picksByTeam.set(p.teamId, []);
    picksByTeam.get(p.teamId)!.push(p);
  }

  const states = new Map<number, TeamState>();
  for (const team of teams) {
    const formation = getFormation(team.formation);
    const filled = new Map<string, Candidate>();
    const clubCounts = new Map<string, number>();
    const nationCounts = new Map<string, number>();
    let benchCount = 0;
    for (const pick of picksByTeam.get(team.id) ?? []) {
      if (pick.slotId && !filled.has(pick.slotId)) filled.set(pick.slotId, pick.player);
      else benchCount++;
      clubCounts.set(pick.player.club, (clubCounts.get(pick.player.club) ?? 0) + 1);
      nationCounts.set(
        pick.player.nationality,
        (nationCounts.get(pick.player.nationality) ?? 0) + 1,
      );
    }
    states.set(team.id, {
      id: team.id,
      draftOrder: team.draftOrder,
      formation,
      neighbours: slotNeighbours(formation),
      filled,
      openSlots: formation.slots.filter((s) => !filled.has(s.id)),
      benchCount,
      clubCounts,
      nationCounts,
      hasCoach: teamsWithCoach.has(team.id),
      temperament: temperamentFor(team.id, difficulty),
    });
  }

  // Fetch enough UNDRAFTED players for this CPU window. A two-league field
  // can already have the top 80 of a group gone by the user's 5th pick —
  // `take: boardFetch` then filtering drafted returns an empty board and
  // freezes the draft.
  const remainingPicks = Math.max(0, totalPicks - draft.currentPick + 1);
  const boardTake = Math.max(
    difficulty.boardSize,
    Math.min(400, remainingPicks + difficulty.boardFetch),
  );
  const boards = new Map<PositionGroup, Candidate[]>();
  await Promise.all(
    POSITION_GROUPS.map(async (group) => {
      const live = await excludeDrafted(
        (take) =>
          prisma.player.findMany({
            where: { positionGroup: group, league: { in: leagues }, year: { in: years } },
            select: CANDIDATE_SELECT,
            orderBy: { overall: "desc" },
            take,
          }),
        draftedPlayerIds,
        boardTake,
      );
      boards.set(group, live);
    }),
  );
  function boardFor(group: PositionGroup): Candidate[] {
    const live = (boards.get(group) ?? []).filter((c) => !draftedPlayerIds.has(c.id));
    boards.set(group, live);
    return live;
  }

  let currentPick = draft.currentPick;
  const newPlayerPicks: {
    pickNumber: number;
    round: number;
    teamId: number;
    playerId: number;
    slotId: string | null;
  }[] = [];
  const newCoachPicks: { pickNumber: number; teamId: number; coachId: number }[] = [];

  /** Picks by other teams between now and this team's next turn — the
   *  window over which the board gets picked clean. */
  function picksUntilNextTurn(pickNumber: number, draftOrder: number): number {
    for (let n = pickNumber + 1; n <= totalPicks; n++) {
      if (pickInfo(n, teamCount).draftOrder === draftOrder) return n - pickNumber - 1;
    }
    return totalPicks - pickNumber;
  }

  /** What the whole field still needs, so scarcity is measured against real
   *  competition: a position five other teams still have open empties much
   *  faster than one only you need. */
  function demandShares(): { byGroup: Record<PositionGroup, number>; coach: number } {
    const counts: Record<PositionGroup, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    let coach = 0;
    let total = 0;
    for (const state of states.values()) {
      for (const slot of state.openSlots) {
        counts[slot.group]++;
        total++;
      }
      if (!state.hasCoach && rules.coach) {
        coach++;
        total++;
      }
      // Bench picks come out of the general pool, spread across groups.
      const benchLeft = Math.max(0, benchPicks - state.benchCount);
      if (state.openSlots.length === 0) {
        for (const group of POSITION_GROUPS) counts[group] += benchLeft / 4;
        total += benchLeft;
      }
    }
    const safe = total > 0 ? total : 1;
    return {
      byGroup: {
        GK: counts.GK / safe,
        DEF: counts.DEF / safe,
        MID: counts.MID / safe,
        FWD: counts.FWD / safe,
      },
      coach: coach / safe,
    };
  }

  while (currentPick <= totalPicks) {
    const { round, draftOrder } = pickInfo(currentPick, teamCount);
    const team = teamByOrder.get(draftOrder);
    if (!team || team.id === draft.userTeamId) break;

    const teamId = team.id;
    const state = states.get(teamId)!;
    const { temperament } = state;
    const isLastRound = round === rounds;
    const mustDraftCoach = rules.coach && isLastRound && !state.hasCoach;

    const window = picksUntilNextTurn(currentPick, draftOrder);
    const demand = demandShares();

    const clubLinkChem = multiLeague ? MULTI_LEAGUE_CLUB_LINK_CHEM : CLUB_LINK_CHEM;
    const nationLinkChem = multiLeague ? MULTI_LEAGUE_NATION_LINK_CHEM : NATION_LINK_CHEM;

    /** Chemistry points this candidate would gain from the squad it's
     *  joining, doubled up when the link sits in a neighbouring slot. */
    function chemistryValue(candidate: Candidate, slot: FormationSlot | null): number {
      if (!rules.chemistry) return 0;
      let value = 0;
      const clubCount = state.clubCounts.get(candidate.club) ?? 0;
      const nationCount = state.nationCounts.get(candidate.nationality) ?? 0;
      if (clubCount > 0 && clubCount < CLUB_STACK_CAP) value += clubLinkChem;
      if (nationCount > 0 && nationCount < NATION_STACK_CAP) value += nationLinkChem;
      if (slot) {
        const near = state.neighbours.get(slot.id);
        let neighbourLinks = 0;
        for (const [slotId, player] of state.filled) {
          if (!near?.has(slotId)) continue;
          if (player.club === candidate.club) neighbourLinks += clubLinkChem;
          else if (player.nationality === candidate.nationality) neighbourLinks += nationLinkChem;
        }
        value += neighbourLinks * (NEIGHBOUR_LINK_MULTIPLIER - 1);
      }
      return value * temperament.chem;
    }

    function ageValue(candidate: Candidate): number {
      if (!rules.age || difficulty.strategyBlend === 0) return 0;
      const value =
        candidate.age >= 24 && candidate.age <= 29
          ? 0.2
          : candidate.age < 20 || candidate.age > 34
            ? -0.25
            : 0;
      return value * difficulty.strategyBlend;
    }

    /** One candidate in one slot, in rating points, exactly as the final
     *  team rating will eventually see it. */
    function valueInSlot(candidate: Candidate, slot: FormationSlot): number | null {
      const fit = positionFit(candidate.positions, slot.code);
      if (rules.fit && FIT_TIERS.indexOf(fit) > WORST_ACCEPTABLE_FIT) return null;
      const chem =
        chemistryValue(candidate, slot) + (rules.fit && rules.chemistry ? FIT_CHEMISTRY_MOD[fit] : 0);
      const upside = rules.potential
        ? Math.max(0, candidate.potential - candidate.overall) * temperament.upside * 0.3
        : 0;
      return (
        candidate.overall +
        (rules.fit ? FIT_RATING_PENALTY[fit] : 0) +
        chem * CHEM_POINT_VALUE +
        upside +
        ageValue(candidate) +
        scoutingOpinion(teamId, candidate.id) * temperament.scoutNoise
      );
    }

    type Choice = { surplus: number; candidate: Candidate; slot: FormationSlot | null };
    let best: Choice | null = null;

    if (!mustDraftCoach) {
      if (state.openSlots.length > 0) {
        for (const slot of state.openSlots) {
          const board = boardFor(slot.group);
          const scored = board
            .map((candidate) => ({ candidate, value: valueInSlot(candidate, slot) }))
            .filter((s): s is { candidate: Candidate; value: number } => s.value !== null)
            .sort((a, b) => b.value - a.value);
          if (scored.length === 0) continue;

          // Whoever is realistically still here at my next turn, given how
          // many teams are chasing this same line.
          const expectedGone = Math.round(window * demand.byGroup[slot.group] * temperament.patience);
          const replacement = scored[Math.min(expectedGone, scored.length - 1)];
          const surplus =
            starterSlotWeight(state.formation.slots.length) *
            (scored[0].value - replacement.value);
          if (!best || surplus > best.surplus) {
            best = { surplus, candidate: scored[0].candidate, slot };
          }
        }
        // Nothing on the board fits any open slot (a very late, very narrow
        // draft) — fall back to the best body available so the turn isn't
        // silently skipped.
        if (!best) {
          outer: for (const slot of state.openSlots) {
            for (const group of POSITION_GROUPS) {
              const board = boardFor(group);
              for (const candidate of board) {
                if (valueInSlot(candidate, slot) === null) continue;
                best = { surplus: 0, candidate, slot };
                break outer;
              }
            }
          }
        }
      } else {
        // Bench: worth a fraction of a starting slot, so this only ever
        // wins the pick once the XI is genuinely complete.
        for (const group of POSITION_GROUPS) {
          const board = boardFor(group);
          const scored = board
            .map((candidate) => ({
              candidate,
              value:
                candidate.overall +
                chemistryValue(candidate, null) * CHEM_POINT_VALUE +
                (rules.potential
                  ? Math.max(0, candidate.potential - candidate.overall) * temperament.upside * 0.3
                  : 0) +
                ageValue(candidate) +
                scoutingOpinion(teamId, candidate.id) * temperament.scoutNoise,
            }))
            .sort((a, b) => b.value - a.value);
          if (scored.length === 0) continue;
          const expectedGone = Math.round(window * demand.byGroup[group] * temperament.patience);
          const replacement = scored[Math.min(expectedGone, scored.length - 1)];
          const surplus =
            benchSlotWeight(benchPicks) *
            (scored[0].value - replacement.value);
          if (!best || surplus > best.surplus) {
            best = { surplus, candidate: scored[0].candidate, slot: null };
          }
        }
      }
    }

    // The coach competes on the same surplus scale: what the best coach
    // left gives over the best coach that will still be here next turn.
    let coachChoice: { surplus: number; coach: (typeof coachBoard)[number] } | null = null;
    if (rules.coach && !state.hasCoach && coachBoard.length > 0) {
      const available = coachBoard.filter((c) => !draftedCoachIds.has(c.id));
      if (available.length > 0) {
        const expectedGone = Math.round(window * demand.coach);
        const replacement = available[Math.min(expectedGone, available.length - 1)];
        coachChoice = {
          surplus: COACH_WEIGHT * (available[0].rating - replacement.rating),
          coach: available[0],
        };
      }
    }

    const takeCoach =
      mustDraftCoach ||
      (coachChoice !== null && (best === null || coachChoice.surplus >= best.surplus));

    if (takeCoach && coachChoice) {
      draftedCoachIds.add(coachChoice.coach.id);
      state.hasCoach = true;
      newCoachPicks.push({
        pickNumber: currentPick,
        teamId,
        coachId: coachChoice.coach.id,
      });
    } else if (best) {
      const { candidate, slot } = best;
      draftedPlayerIds.add(candidate.id);
      if (slot) {
        state.filled.set(slot.id, candidate);
        state.openSlots = state.openSlots.filter((s) => s.id !== slot.id);
      } else {
        state.benchCount++;
      }
      state.clubCounts.set(candidate.club, (state.clubCounts.get(candidate.club) ?? 0) + 1);
      state.nationCounts.set(
        candidate.nationality,
        (state.nationCounts.get(candidate.nationality) ?? 0) + 1,
      );
      newPlayerPicks.push({
        pickNumber: currentPick,
        round,
        teamId,
        playerId: candidate.id,
        slotId: slot?.id ?? null,
      });
    } else {
      break;
    }
    currentPick += 1;
  }

  // One write for the whole CPU run. skipDuplicates covers two overlapping
  // advanceDraft() calls racing the same window.
  if (newPlayerPicks.length > 0) {
    await prisma.draftPick.createMany({
      data: newPlayerPicks.map((pick) => ({ ...pick, draftId })),
      skipDuplicates: true,
    });
  }
  if (newCoachPicks.length > 0) {
    await prisma.coachPick.createMany({
      data: newCoachPicks.map((pick) => ({ ...pick, draftId })),
      skipDuplicates: true,
    });
  }

  const status = currentPick > totalPicks ? "complete" : "in_progress";
  return prisma.draft.update({
    where: { id: draftId },
    data: { currentPick, status },
  });
}
