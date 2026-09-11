import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { playerImageSrc, clubLogoSrc } from "@/lib/player-image";
import { flagUrl } from "@/lib/country-flags";
import { cardTierAccentBorderClass } from "@/lib/card-tier";
import { advanceDraft, parseDraftYears, pickInfo, roundsForDraft } from "@/lib/draft";
import { POSITION_GROUPS } from "@/lib/positions";
import {
  FIT_LABELS,
  FIT_TIERS,
  positionFit,
  type Fit,
  type Formation,
} from "@/lib/formations";
import { SlotPitch, type SlotOccupant } from "@/components/slot-pitch";
import { DraftFilters } from "@/components/draft-filters";
import { DraftCompleteFlow, type Hindsight } from "@/components/draft-complete-flow";
import { bestPossibleSquad, type PoolCoach, type PoolPlayer } from "@/lib/hindsight";
import { DraftLiveFactors } from "@/components/draft-live-factors";
import { DraftLiveLayout } from "@/components/draft-live-layout";
import { StadiumShell } from "@/components/stadium-shell";
import { bebas } from "@/lib/game-fonts";
import { slotEffectiveRating } from "@/lib/team-rating";
import { evaluateSquad } from "@/lib/squad-evaluation";
import {
  benchPicksForMode,
  scoringRulesFromDraft,
  type ScoringRules,
} from "@/lib/scoring-rules";
import { gameModeConfig, supportsDivisions } from "@/lib/game-mode";
import { seasonOutcome } from "@/lib/season-divisions";
import { makePick, makeCoachPick } from "./actions";

const PAGE_SIZE = 8;
const ALL = "ALL";
const BENCH = "BENCH";
const COACH = "HC";

type SquadPick = {
  id: number;
  round: number;
  pickNumber: number;
  slotId: string | null;
  player: {
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
  };
};

function buildQueryString(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

function remainingUserPicks(
  currentPick: number,
  teamCount: number,
  userDraftOrder: number,
  totalPicks: number,
) {
  let count = 0;
  for (let pick = currentPick; pick <= totalPicks; pick++) {
    if (pickInfo(pick, teamCount).draftOrder === userDraftOrder) count++;
  }
  return count;
}

function cpuPicksAfterCurrent(
  currentPick: number,
  teamCount: number,
  userDraftOrder: number,
  totalPicks: number,
) {
  for (let pick = currentPick + 1; pick <= totalPicks; pick++) {
    if (pickInfo(pick, teamCount).draftOrder === userDraftOrder) {
      return pick - currentPick - 1;
    }
  }
  return Math.max(0, totalPicks - currentPick);
}

function potBadgeClass(gap: number): string {
  if (gap >= 8) return "border-emerald-400/50 text-emerald-300";
  if (gap >= 3) return "border-emerald-400/30 text-emerald-300/80";
  return "border-white/20 text-white/45";
}

const FIT_TEXT: Record<Fit, string> = {
  exact: "text-emerald-400",
  natural: "text-lime-300",
  reasonable: "text-amber-300",
  outOfPosition: "text-orange-400",
  emergency: "text-red-400",
};

function occupantsFor<T extends SquadPick["player"]>(
  formation: Formation,
  starters: Map<string, T>,
  chemistry: Map<number, number>,
  coachRating: number | undefined,
  rules: ScoringRules,
): Map<string, SlotOccupant> {
  const occupants = new Map<string, SlotOccupant>();
  for (const slot of formation.slots) {
    const player = starters.get(slot.id);
    if (!player) continue;
    const chem = chemistry.get(player.id) ?? 0;
    const { effective, fit } = slotEffectiveRating(player, slot.code, chem, coachRating, rules);
    occupants.set(slot.id, {
      name: player.name,
      effective,
      imageUrl: player.imageUrl,
      chemistry: chem,
      fit,
      club: player.club,
      clubId: player.clubId,
      league: player.league,
      nationality: player.nationality,
    });
  }
  return occupants;
}

/**
 * How deep the hindsight search looks. The optimiser only ever wants
 * players good enough to make an ideal squad, and capping the pool keeps the
 * end-of-draft screen instant even in a five-league, multi-year draft.
 */
const HINDSIGHT_POOL_SIZE = 300;

/**
 * The "what was there" screen: the strongest squad the user's own pick
 * numbers could have produced. Rival picks are replayed exactly as they
 * happened, so a player counts as reachable only while he was still on the
 * board at one of your turns — the gap it reports is draft skill, not luck
 * of the slot.
 */
async function bestPossibleForUser(args: {
  draftId: number;
  userTeamId: number;
  userDraftOrder: number;
  teamCount: number;
  totalPicks: number;
  formation: Formation;
  leagues: string[];
  years: number[];
  allPicks: { teamId: number; playerId: number; pickNumber: number }[];
  allCoachPicks: { teamId: number; coachId: number; pickNumber: number }[];
  rules: ScoringRules;
  benchSlots: number;
}): Promise<Hindsight | null> {
  const userPicks: number[] = [];
  for (let pick = 1; pick <= args.totalPicks; pick++) {
    if (pickInfo(pick, args.teamCount).draftOrder === args.userDraftOrder) userPicks.push(pick);
  }
  if (userPicks.length === 0) return null;

  const playerDeadline = new Map<number, number>();
  for (const pick of args.allPicks) {
    if (pick.teamId === args.userTeamId) continue;
    const known = playerDeadline.get(pick.playerId);
    if (known === undefined || pick.pickNumber < known) {
      playerDeadline.set(pick.playerId, pick.pickNumber);
    }
  }
  const coachDeadline = new Map<number, number>();
  for (const pick of args.allCoachPicks) {
    if (pick.teamId === args.userTeamId) continue;
    const known = coachDeadline.get(pick.coachId);
    if (known === undefined || pick.pickNumber < known) {
      coachDeadline.set(pick.coachId, pick.pickNumber);
    }
  }

  const [pool, coachPool] = await Promise.all([
    prisma.player.findMany({
      where: { league: { in: args.leagues }, year: { in: args.years } },
      orderBy: { overall: "desc" },
      take: HINDSIGHT_POOL_SIZE,
    }),
    prisma.coach.findMany({ where: { draftId: args.draftId } }),
  ]);

  const firstPick = userPicks[0];
  const players: PoolPlayer[] = pool
    .map((player) => ({ ...player, deadline: playerDeadline.get(player.id) ?? Infinity }))
    .filter((player) => player.deadline > firstPick);
  const coaches: PoolCoach[] = args.rules.coach
    ? coachPool
        .map((coach) => ({ ...coach, deadline: coachDeadline.get(coach.id) ?? Infinity }))
        .filter((coach) => coach.deadline > firstPick)
    : [];

  const best = bestPossibleSquad({
    formation: args.formation,
    userPicks,
    players,
    coaches,
    benchSlots: args.benchSlots,
    rules: args.rules,
  });
  if (!best) return null;

  const occupants = occupantsFor(
    args.formation,
    best.starters,
    best.chemistry,
    best.coach?.rating,
    args.rules,
  );

  return {
    rating: best.rating,
    coachName: best.coach?.name ?? null,
    coachRating: best.coach?.rating ?? null,
    occupants: [...occupants.entries()].map(([slotId, player]) => ({ slotId, player })),
  };
}

export const dynamic = "force-dynamic";

export default async function DraftBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    q?: string;
    page?: string;
    slot?: string;
    league?: string;
    sort?: string;
    fit?: string;
  }>;
}) {
  const { id } = await params;
  const draftId = Number.parseInt(id, 10);
  if (!draftId) notFound();

  await advanceDraft(draftId);

  const draft = await prisma.draft.findUnique({
    where: { id: draftId },
    include: { userTeam: true },
  });
  if (!draft) notFound();
  if (!draft.userTeamId || !draft.userTeam) {
    redirect(`/draft/${draftId}/pick-team`);
  }
  if (draft.status === "selecting_team" || draft.status === "rolling_pick" || draft.status === "pick_revealed") {
    redirect(`/draft/${draftId}/pick-team`);
  }
  const userTeamId = draft.userTeamId;
  const userTeam = draft.userTeam;
  const selectedLeagues = draft.leagues.split(",");
  const selectedYears = parseDraftYears(draft.years);

  const rules = scoringRulesFromDraft(draft);
  const mode = gameModeConfig(draft.gameMode);
  const starterCount = mode.starters;
  const benchPicks = benchPicksForMode(draft.gameMode);
  const rounds = roundsForDraft(draft);
  const teams = await prisma.team.findMany({
    where: { draftId },
    orderBy: { draftOrder: "asc" },
  });
  const teamCount = teams.length;
  const totalPicks = teamCount * rounds;

  const mySquad = await prisma.draftPick.findMany({
    where: { draftId, teamId: userTeamId },
    orderBy: { pickNumber: "asc" },
    include: { player: true },
  });

  const myCoachPick = await prisma.coachPick.findFirst({
    where: { draftId, teamId: userTeamId },
    include: { coach: true },
  });
  const myCoachRating = myCoachPick?.coach.rating;

  const me = evaluateSquad(userTeam.formation, mySquad, myCoachRating, rules);
  const unified = me.rating;
  const teamChemistry = me.teamChemistry;
  const myOccupants = occupantsFor(me.formation, me.starters, me.chemistry, myCoachRating, rules);
  const naturalStartersLive = unified.slots.filter(
    (s) => s.fit === "exact" || s.fit === "natural",
  ).length;

  if (draft.status === "complete") {
    const allPicks = await prisma.draftPick.findMany({
      where: { draftId },
      include: { player: true },
      orderBy: [{ teamId: "asc" }, { pickNumber: "asc" }],
    });
    const byTeam = new Map<number, SquadPick[]>();
    for (const pick of allPicks) {
      if (!byTeam.has(pick.teamId)) byTeam.set(pick.teamId, []);
      byTeam.get(pick.teamId)!.push(pick);
    }

    const allCoachPicks = await prisma.coachPick.findMany({
      where: { draftId },
      include: { coach: true },
    });
    const coachByTeam = new Map<number, (typeof allCoachPicks)[number]>();
    for (const pick of allCoachPicks) coachByTeam.set(pick.teamId, pick);

    const leaderboard = teams
      .map((team) => {
        const picks = byTeam.get(team.id) ?? [];
        const coach = coachByTeam.get(team.id)?.coach;
        const result = evaluateSquad(team.formation, picks, coach?.rating, rules);
        return {
          team,
          rating: result.rating.rating,
          chemistry: result.teamChemistry,
          breakdown: result.rating,
          coach: coach ?? null,
          occupants: occupantsFor(
            result.formation,
            result.starters,
            result.chemistry,
            coach?.rating,
            rules,
          ),
        };
      })
      .sort((a, b) => b.rating - a.rating);

    const myRank = leaderboard.findIndex((t) => t.team.id === draft.userTeamId) + 1;
    const divisionOutcome =
      supportsDivisions(draft.gameMode) && draft.divisionsEnabled
        ? seasonOutcome(myRank, leaderboard.length, draft.division)
        : null;
    const titleResults = draft.careerKey
      ? await prisma.careerResult.findMany({
          where: { careerKey: draft.careerKey, fieldRank: 1 },
          select: { draftId: true, division: true },
          orderBy: { seasonNumber: "asc" },
        })
      : [];
    // Completion records normally exist before this page renders. Include
    // the current title defensively if an older deployment completed it.
    const titleDivisions = titleResults.map((title) => title.division);
    if (
      divisionOutcome &&
      myRank === 1 &&
      !titleResults.some((title) => title.draftId === draftId)
    ) {
      titleDivisions.push(draft.division);
    }

    const completeLines = POSITION_GROUPS.map((group) => {
      const yours = unified.lines.find((l) => l.group === group)?.effectiveAvg ?? 0;
      const field = leaderboard
        .map((entry) => entry.breakdown.lines.find((l) => l.group === group)?.effectiveAvg ?? 0)
        .sort((a, b) => b - a);
      const leagueAvg =
        field.length === 0 ? 0 : field.reduce((sum, v) => sum + v, 0) / field.length;
      const better = field.filter((v) => v > yours + 0.05).length;
      return {
        group,
        yours: Math.round(yours * 10) / 10,
        leagueAvg: Math.round(leagueAvg * 10) / 10,
        rank: better + 1,
        fieldSize: leaderboard.length,
      };
    });

    const naturalStarters = unified.slots.filter(
      (s) => s.fit === "exact" || s.fit === "natural",
    ).length;

    const hindsight = await bestPossibleForUser({
      draftId,
      userTeamId,
      userDraftOrder: userTeam.draftOrder,
      teamCount,
      totalPicks,
      formation: me.formation,
      leagues: selectedLeagues,
      years: selectedYears,
      allPicks,
      allCoachPicks,
      rules,
      benchSlots: benchPicks,
    });

    return (
      <StadiumShell scrollable>
        <DraftCompleteFlow
          draftId={draftId}
          clubName={userTeam.shortName}
          formationKey={userTeam.formation}
          rank={myRank}
          rating={unified.rating}
          chemistry={teamChemistry}
          naturalStarters={naturalStarters}
          starterCount={starterCount}
          fitCost={unified.fitCost}
          occupants={[...myOccupants.entries()].map(([slotId, player]) => ({
            slotId,
            player,
          }))}
          lines={completeLines}
          teams={leaderboard.map((entry) => ({
            teamId: entry.team.id,
            shortName: entry.team.shortName,
            formation: entry.team.formation,
            rating: entry.rating,
            chemistry: entry.chemistry,
            coachName: entry.coach?.name ?? null,
            coachRating: entry.coach?.rating ?? null,
            isYou: entry.team.id === draft.userTeamId,
            occupants: [...entry.occupants.entries()].map(([slotId, player]) => ({
              slotId,
              player,
            })),
          }))}
          hindsight={hindsight}
          rules={rules}
          leaderboardHref={
            divisionOutcome
              ? `/leaderboard?mode=${draft.gameMode}&division=${draft.division}&returnTo=${encodeURIComponent(`/draft/${draftId}`)}`
              : undefined
          }
          titleDivisions={titleDivisions}
          season={
            divisionOutcome
              ? {
                  number: draft.seasonNumber,
                  division: draft.division,
                  outcomeLabel: divisionOutcome.label,
                  movement: divisionOutcome.movement,
                  promotionMaxRank: divisionOutcome.promotionMaxRank,
                  relegationMinRank: divisionOutcome.relegationMinRank,
                }
              : null
          }
        />
      </StadiumShell>
    );
  }

  const { round } = pickInfo(draft.currentPick, teamCount);
  const yourPicksLeft = remainingUserPicks(
    draft.currentPick,
    teamCount,
    userTeam.draftOrder,
    totalPicks,
  );
  const cpuAfterYou = cpuPicksAfterCurrent(
    draft.currentPick,
    teamCount,
    userTeam.draftOrder,
    totalPicks,
  );
  const myHasCoach = myCoachPick !== null;
  const mustDraftCoachNow = rules.coach && round === rounds && !myHasCoach;

  const openSlots = me.formation.slots.filter((s) => !me.starters.has(s.id));
  const benchOpen = openSlots.length === 0 && me.bench.length < benchPicks;

  const {
    q = "",
    page: pageParam,
    slot: slotParam,
    league = "",
    sort = "",
    fit = "",
  } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const orderBy: { overall: "desc" } | { potential: "desc" } =
    rules.potential && sort === "potential_desc" ? { potential: "desc" } : { overall: "desc" };

  // A stale ?slot lingers in the URL after every pick (the form re-renders
  // the same URL), so the target always falls back to something this team
  // can still draft into. All is the default browse: every remaining player,
  // with the server placing them in their best open slot on pick.
  const requestedSlot = openSlots.find((s) => s.id === slotParam) ?? null;
  const wantAll =
    !mustDraftCoachNow &&
    (slotParam === ALL || slotParam === undefined || slotParam === "");
  const target:
    | { kind: "all" }
    | { kind: "slot"; slotId: string }
    | { kind: "bench" }
    | { kind: "coach" } = mustDraftCoachNow || (slotParam === COACH && !myHasCoach)
    ? { kind: "coach" }
    : wantAll
      ? { kind: "all" }
      : requestedSlot
        ? { kind: "slot", slotId: requestedSlot.id }
        : slotParam === BENCH && benchOpen
          ? { kind: "bench" }
          : openSlots.length > 0
            ? { kind: "all" }
            : benchOpen
              ? { kind: "bench" }
              : !myHasCoach
                ? { kind: "coach" }
                : { kind: "all" };

  const targetSlot =
    target.kind === "slot"
      ? me.formation.slots.find((s) => s.id === target.slotId)!
      : null;
  const slotKey =
    target.kind === "slot"
      ? target.slotId
      : target.kind === "coach"
        ? COACH
        : target.kind === "bench"
          ? BENCH
          : ALL;
  const naturalOnly = fit === "natural" && targetSlot !== null;

  let players: SquadPick["player"][] = [];
  let totalPages = 1;
  let availableCoaches: Awaited<ReturnType<typeof prisma.coach.findMany>> = [];

  if (target.kind === "coach") {
    // A `notIn` list of drafted coach ids doesn't scale — SQLite caps bound
    // parameters per query. The relational filter expresses the same thing
    // as a join instead of a parameter list.
    availableCoaches = await prisma.coach.findMany({
      where: { draftId, coachPicks: { none: {} } },
      orderBy: { rating: "desc" },
    });
  } else {
    // Specific slot: that line PLUS anyone who lists this exact position.
    // All / bench: every remaining player in the draft's leagues and years.
    const slotWhere = targetSlot
      ? naturalOnly
        ? { positions: { contains: targetSlot.code } }
        : {
            OR: [
              { positionGroup: targetSlot.group },
              { positions: { contains: targetSlot.code } },
            ],
          }
      : {};
    const where = {
      draftPicks: { none: { draftId } },
      ...(q ? { name: { contains: q } } : {}),
      league: league ? league : { in: selectedLeagues },
      year: { in: selectedYears },
      ...slotWhere,
    };
    const [foundPlayers, total] = await Promise.all([
      prisma.player.findMany({
        where,
        orderBy,
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.player.count({ where }),
    ]);
    players = foundPlayers;
    totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  }

  const pickProgress = Math.min(100, (draft.currentPick / totalPicks) * 100);
  const slotHref = (slotId: string) =>
    `/draft/${draftId}${buildQueryString({ slot: slotId, league, sort })}`;

  function bestOpenSlotFor(positions: string) {
    if (openSlots.length === 0) return null;
    let best = openSlots[0];
    let bestRank = FIT_TIERS.indexOf(positionFit(positions, best.code));
    for (const slot of openSlots.slice(1)) {
      const rank = FIT_TIERS.indexOf(positionFit(positions, slot.code));
      if (rank < bestRank) {
        best = slot;
        bestRank = rank;
      }
    }
    return { slot: best, fit: positionFit(positions, best.code) };
  }

  return (
    <StadiumShell fill>
      <main className="mx-auto flex h-full min-h-0 w-full max-w-[1400px] flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 pb-2">
          <div className="flex min-w-0 items-baseline gap-3">
            <h1 className={`${bebas.className} truncate text-3xl tracking-wide text-white`}>
              {userTeam.shortName}
            </h1>
            <span
              className={`${bebas.className} hidden truncate text-lg tracking-[0.2em] text-white/40 sm:inline`}
            >
              {draft.divisionsEnabled && supportsDivisions(draft.gameMode)
                ? `Division ${draft.division} · Season ${draft.seasonNumber}`
                : me.formation.name}
            </span>
          </div>
          <div className="flex items-center gap-4 sm:gap-5">
            {mySquad.length > 0 && (
              <>
                <div className="hidden text-right sm:block">
                  <div className={`${bebas.className} text-2xl leading-none text-white`}>
                    {unified.rating.toFixed(1)}
                  </div>
                  <div className="text-[10px] tracking-[0.18em] text-white/40 uppercase">Rating</div>
                </div>
                {rules.chemistry && (
                <div className="hidden text-right sm:block">
                  <div
                    className={`${bebas.className} text-2xl leading-none ${
                      teamChemistry >= 8
                        ? "text-emerald-300"
                        : teamChemistry >= 6
                          ? "text-amber-300"
                          : "text-red-400"
                    }`}
                    title="8 is neutral. Above pulls players toward potential."
                  >
                    {teamChemistry.toFixed(1)}
                  </div>
                  <div className="text-[10px] tracking-[0.18em] text-white/40 uppercase">Chem</div>
                </div>
                )}
                {rules.fit && (
                <div className="hidden text-right md:block">
                  <div
                    className={`${bebas.className} text-2xl leading-none ${
                      naturalStartersLive === me.starters.size && me.starters.size > 0
                        ? "text-emerald-300"
                        : "text-white"
                    }`}
                    title="Starters in natural / comfortable roles"
                  >
                    {naturalStartersLive}
                    <span className="text-lg text-white/40">/{starterCount}</span>
                  </div>
                  <div className="text-[10px] tracking-[0.18em] text-white/40 uppercase">Natural</div>
                </div>
                )}
                {rules.fit && unified.fitCost < -0.05 && (
                  <div className="hidden text-right lg:block">
                    <div className={`${bebas.className} text-2xl leading-none text-amber-300`}>
                      {unified.fitCost.toFixed(1)}
                    </div>
                    <div className="text-[10px] tracking-[0.18em] text-white/40 uppercase">Fit</div>
                  </div>
                )}
                {rules.coach && myCoachRating != null && (
                  <div className="hidden text-right xl:block">
                    <div className={`${bebas.className} text-2xl leading-none text-white`}>
                      {myCoachRating}
                    </div>
                    <div className="text-[10px] tracking-[0.18em] text-white/40 uppercase">Coach</div>
                  </div>
                )}
              </>
            )}
          </div>
        </header>

        <div className="mb-3 shrink-0 border border-white/20 bg-black/50 px-3 py-2.5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className={`${bebas.className} text-sm tracking-[0.28em] text-emerald-300`}>
                On the clock
              </p>
              <p className={`${bebas.className} mt-0.5 text-3xl leading-none tracking-wide text-white`}>
                Pick {draft.currentPick}
                <span className="text-xl text-white/40"> / {totalPicks}</span>
              </p>
            </div>
            <div className="text-right">
              <p className={`${bebas.className} text-2xl leading-none text-white`}>
                {yourPicksLeft}
              </p>
              <p className="text-[10px] tracking-[0.16em] text-white/45 uppercase">
                {yourPicksLeft === 1 ? "pick left" : "picks left"}
              </p>
            </div>
          </div>
          <p className="mt-1.5 text-[12px] leading-snug text-white/60">
            Round {round}
            {cpuAfterYou > 0
              ? ` · ${cpuAfterYou} club${cpuAfterYou === 1 ? "" : "s"} pick after you`
              : " · last pick of the snake"}
          </p>
          <div className="mt-2 h-0.5 bg-white/15">
            <div className="h-full bg-white" style={{ width: `${pickProgress}%` }} />
          </div>
        </div>

        <DraftLiveLayout
          currentPick={draft.currentPick}
          cpuPicksAfterYou={cpuAfterYou}
          board={
          <section className="flex min-h-0 flex-1 flex-col bg-black/50 backdrop-blur-sm">
            <nav className="flex shrink-0 flex-wrap items-center gap-1 px-4 pt-3">
              {mustDraftCoachNow ? (
                <span className={`${bebas.className} px-2 py-1 text-lg tracking-wide text-white`}>
                  Last pick — hire your coach
                </span>
              ) : (
                <>
                  <Link
                    href={`/draft/${draftId}${buildQueryString({ league, sort })}`}
                    className={`${bebas.className} px-2 py-1 text-lg tracking-wide ${
                      slotKey === ALL ? "bg-white text-black" : "text-white/50 hover:text-white"
                    }`}
                  >
                    All
                  </Link>
                  {openSlots.map((s) => (
                    <Link
                      key={s.id}
                      href={slotHref(s.id)}
                      className={`${bebas.className} px-2 py-1 text-lg tracking-wide ${
                        slotKey === s.id ? "bg-white text-black" : "text-white/50 hover:text-white"
                      }`}
                    >
                      {s.code}
                    </Link>
                  ))}
                  {benchOpen && (
                    <Link
                      href={`/draft/${draftId}${buildQueryString({ slot: BENCH, league, sort })}`}
                      className={`${bebas.className} px-2 py-1 text-lg tracking-wide ${
                        slotKey === BENCH ? "bg-white text-black" : "text-white/50 hover:text-white"
                      }`}
                    >
                      Sub
                    </Link>
                  )}
                  {!myHasCoach && rules.coach && (
                    <Link
                      href={`/draft/${draftId}${buildQueryString({ slot: COACH })}`}
                      className={`${bebas.className} px-2 py-1 text-lg tracking-wide ${
                        slotKey === COACH ? "bg-white text-black" : "text-white/50 hover:text-white"
                      }`}
                    >
                      HC
                    </Link>
                  )}
                </>
              )}
            </nav>

            {target.kind === "coach" ? (
              <ul className="min-h-0 flex-1 overflow-y-auto px-2 pt-2">
                {availableCoaches.map((coach) => {
                  const crest = clubLogoSrc(coach.clubId, 30);
                  return (
                    <li key={coach.id} className="flex items-center gap-3 px-2 py-2">
                      <span className="w-7 shrink-0 text-right text-sm font-semibold text-white">
                        {coach.rating}
                      </span>
                      {crest && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={crest}
                          alt=""
                          width={22}
                          height={22}
                          className="h-5 w-5 object-contain"
                        />
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm text-white">
                        {coach.name}
                      </span>
                      <form action={makeCoachPick}>
                        <input type="hidden" name="draftId" value={draftId} />
                        <input type="hidden" name="coachId" value={coach.id} />
                        <button
                          type="submit"
                          className="h-8 w-8 bg-white text-lg leading-none text-black transition hover:bg-white/80"
                          aria-label={`Draft ${coach.name}`}
                        >
                          +
                        </button>
                      </form>
                    </li>
                  );
                })}
                {availableCoaches.length === 0 && (
                  <li className="px-4 py-10 text-center text-sm text-white/40">None left</li>
                )}
              </ul>
            ) : (
              <>
                <div className="shrink-0 px-4">
                  <DraftFilters
                    draftId={draftId}
                    slot={slotKey}
                    initialQuery={q}
                    initialLeague={league}
                    initialSort={sort}
                    naturalOnly={naturalOnly}
                    leagueOptions={selectedLeagues}
                    canFilterFit={targetSlot !== null && rules.fit}
                    canSortPotential={rules.potential}
                  />
                </div>

                <ul className="min-h-0 flex-1 overflow-y-auto px-2 pt-2">
                  {players.map((player) => {
                    const gap = player.potential - player.overall;
                    const tierRing = cardTierAccentBorderClass(player.overall, "border-white/20");
                    const autoSlot =
                      target.kind === "all" ? bestOpenSlotFor(player.positions) : null;
                    const playerFit = targetSlot
                      ? positionFit(player.positions, targetSlot.code)
                      : autoSlot?.fit ?? null;
                    const fitLabel = targetSlot
                      ? targetSlot.code
                      : autoSlot
                        ? autoSlot.slot.code
                        : null;
                    return (
                      <li key={player.id} className="flex items-center gap-2.5 px-2 py-2">
                        <span className="w-7 shrink-0 text-right text-sm font-black text-white">
                          {player.overall}
                        </span>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={playerImageSrc(player.imageUrl)}
                          alt=""
                          width={32}
                          height={32}
                          className={`h-8 w-8 shrink-0 rounded-full border object-cover ${tierRing}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="truncate text-sm font-medium text-white">
                              {player.name}
                            </span>
                            {rules.potential && gap > 0 && (
                              <span className={`shrink-0 text-[10px] ${potBadgeClass(gap)}`}>
                                {player.potential}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-tight text-white/55">
                            <span className="font-medium text-white/75">{player.positions}</span>
                            <span className="text-white/25">·</span>
                            <span className="shrink-0 text-white/75">{player.age}</span>
                            <span className="text-white/25">·</span>
                            <span className="inline-flex min-w-0 items-center gap-1">
                              {clubLogoSrc(player.clubId, 30) && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={clubLogoSrc(player.clubId, 30)!}
                                  alt=""
                                  width={12}
                                  height={12}
                                  className="h-3 w-3 shrink-0 object-contain"
                                />
                              )}
                              <span className="truncate">{player.club || "Free agent"}</span>
                            </span>
                            <span className="text-white/25">·</span>
                            <span className="truncate">{player.league}</span>
                            <span className="text-white/25">·</span>
                            <span className="inline-flex min-w-0 items-center gap-1">
                              {flagUrl(player.nationality) && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={flagUrl(player.nationality)!}
                                  alt=""
                                  width={12}
                                  height={8}
                                  className="h-2.5 w-3.5 shrink-0 object-cover"
                                />
                              )}
                              <span className="truncate">{player.nationality}</span>
                            </span>
                          </div>
                        </div>
                        {rules.fit && playerFit && fitLabel && (
                          <span
                            title={
                              targetSlot
                                ? `${FIT_LABELS[playerFit]} at ${fitLabel}`
                                : `Places at ${fitLabel} — ${FIT_LABELS[playerFit]}`
                            }
                            className={`shrink-0 text-[10px] tracking-[0.1em] uppercase ${FIT_TEXT[playerFit]}`}
                          >
                            {playerFit === "exact" ? fitLabel : `${fitLabel}`}
                          </span>
                        )}
                        <form action={makePick}>
                          <input type="hidden" name="draftId" value={draftId} />
                          <input type="hidden" name="playerId" value={player.id} />
                          <input type="hidden" name="slotId" value={targetSlot?.id ?? ""} />
                          <button
                            type="submit"
                            className="h-8 w-8 bg-white text-lg leading-none text-black transition hover:bg-white/80"
                            aria-label={`Draft ${player.name}`}
                          >
                            +
                          </button>
                        </form>
                      </li>
                    );
                  })}
                  {players.length === 0 && (
                    <li className="px-4 py-10 text-center text-sm text-white/40">No matches</li>
                  )}
                </ul>

                <div className="flex shrink-0 items-center justify-between gap-3 px-3 py-2.5">
                  <Link
                    href={`/draft/${draftId}${buildQueryString({ q, slot: slotKey, league, sort, fit, page: page > 1 ? page - 1 : undefined })}`}
                    aria-label="Previous page"
                    aria-disabled={page <= 1}
                    className={`${bebas.className} flex h-11 min-w-11 items-center justify-center border border-white/35 bg-black/40 px-3 text-3xl leading-none text-white transition hover:border-white hover:bg-white hover:text-black ${
                      page <= 1 ? "pointer-events-none opacity-25" : ""
                    }`}
                  >
                    ‹
                  </Link>
                  <span className={`${bebas.className} text-lg tracking-[0.16em] text-white/70`}>
                    {page} / {totalPages}
                  </span>
                  <Link
                    href={`/draft/${draftId}${buildQueryString({ q, slot: slotKey, league, sort, fit, page: page + 1 })}`}
                    aria-label="Next page"
                    aria-disabled={page >= totalPages}
                    className={`${bebas.className} flex h-11 min-w-11 items-center justify-center border border-white/35 bg-black/40 px-3 text-3xl leading-none text-white transition hover:border-white hover:bg-white hover:text-black ${
                      page >= totalPages ? "pointer-events-none opacity-25" : ""
                    }`}
                  >
                    ›
                  </Link>
                </div>
              </>
            )}
          </section>
          }
          team={
          <section className="relative flex min-h-0 flex-1 flex-col">
            <div className="mb-2 flex shrink-0 items-center justify-between text-[11px] tracking-[0.16em] text-white/40 uppercase">
              <span>
                {me.starters.size}/{starterCount} {mode.shortLabel}
                {me.bench.length > 0 ? ` · ${me.bench.length} sub` : ""}
              </span>
              {myCoachPick?.coach && (
                <span className="text-white/70">{myCoachPick.coach.name}</span>
              )}
            </div>
            <div className="mx-auto w-full max-w-md shrink-0 lg:aspect-auto lg:h-full lg:min-h-0 lg:max-w-none lg:flex-1 lg:shrink">
              <div className="aspect-[3/4] h-auto w-full lg:aspect-auto lg:h-full">
                <SlotPitch
                  compact
                  formation={me.formation}
                  occupants={myOccupants}
                  selectedSlotId={targetSlot?.id ?? null}
                  slotHref={slotHref}
                />
              </div>
            </div>
            {mySquad.length > 0 && (
              <div className="mt-3 shrink-0">
                <DraftLiveFactors
                  lines={unified.lines}
                  chemistry={teamChemistry}
                  chemCoachSwing={unified.chemCoachSwing}
                  fitCost={unified.fitCost}
                  naturalStarters={naturalStartersLive}
                  filledSlots={me.starters.size}
                  starterCount={starterCount}
                  experienceLabel={unified.experienceLabel}
                  experienceDelta={unified.experienceDelta}
                  coachRating={myCoachRating}
                  coachName={myCoachPick?.coach.name ?? null}
                  rules={rules}
                />
              </div>
            )}
          </section>
          }
        />
      </main>
    </StadiumShell>
  );
}
