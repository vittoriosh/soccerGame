"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  advanceDraft,
  draftTotals,
  getDraftedCoachIds,
  getTeamSquadState,
  parseDraftYears,
  pickInfo,
  roundsForDraft,
  teamHasCoach,
} from "@/lib/draft";
import { FIT_TIERS, positionFit } from "@/lib/formations";
import { formationsForMode } from "@/lib/formations";
import { shuffled } from "@/lib/league-data";
import { scoringRulesFromDraft } from "@/lib/scoring-rules";
import { evaluateSquad } from "@/lib/squad-evaluation";
import {
  divisionScope,
  rollDivisionYears,
  seasonOutcome,
} from "@/lib/season-divisions";
import { availablePlayerYears, createDraft, type KeptClub } from "@/lib/create-draft";
import { isCareerMode } from "@/lib/game-mode";

export async function makePick(formData: FormData) {
  const draftId = Number.parseInt(String(formData.get("draftId")), 10);
  const playerId = Number.parseInt(String(formData.get("playerId")), 10);
  // Empty means "pick the best open slot for me" while the XI is incomplete,
  // or bench once every starter slot is filled.
  const requestedSlot = String(formData.get("slotId") ?? "").trim();
  if (!draftId || !playerId) throw new Error("Missing draftId or playerId");

  const [draft, teams, alreadyTaken, player] = await Promise.all([
    prisma.draft.findUniqueOrThrow({ where: { id: draftId } }),
    prisma.team.findMany({
      where: { draftId },
      orderBy: { draftOrder: "asc" },
    }),
    prisma.draftPick.findFirst({
      where: { draftId, playerId },
      select: { id: true },
    }),
    prisma.player.findUniqueOrThrow({
      where: { id: playerId },
      select: { league: true, year: true, positions: true },
    }),
  ]);
  if (draft.status !== "in_progress") return;

  const teamCount = teams.length;
  const rounds = roundsForDraft(draft);
  const { round, draftOrder } = pickInfo(draft.currentPick, teamCount);
  const onTheClock = teams.find((t) => t.draftOrder === draftOrder);

  if (!onTheClock || onTheClock.id !== draft.userTeamId) {
    throw new Error("Not your turn");
  }

  if (round === rounds && draft.coachEnabled !== false && !(await teamHasCoach(draftId, onTheClock.id))) {
    throw new Error("This is your last round — you must draft your coach now");
  }

  if (alreadyTaken) {
    throw new Error("Player already drafted");
  }

  const leagues = draft.leagues.split(",");
  if (!leagues.includes(player.league)) {
    throw new Error("That player isn't in one of this draft's leagues");
  }

  const years = parseDraftYears(draft.years);
  if (!years.includes(player.year)) {
    throw new Error("That player isn't from one of this draft's years");
  }

  // Where a player goes is the pick, not an afterthought: the same player is
  // worth different amounts in different slots, so the slot is validated as
  // strictly as the player. An empty request from the All board means place
  // them in their best remaining open slot.
  const squad = await getTeamSquadState(draftId, onTheClock.id, onTheClock.formation);
  let slotId: string | null = null;
  if (requestedSlot) {
    const slot = squad.openSlots.find((s) => s.id === requestedSlot);
    if (!slot) {
      throw new Error("That position is already filled");
    }
    slotId = slot.id;
  } else if (squad.openSlots.length > 0) {
    let best = squad.openSlots[0];
    let bestRank = FIT_TIERS.indexOf(positionFit(player.positions, best.code));
    for (const slot of squad.openSlots.slice(1)) {
      const rank = FIT_TIERS.indexOf(positionFit(player.positions, slot.code));
      if (rank < bestRank) {
        best = slot;
        bestRank = rank;
      }
    }
    slotId = best.id;
  } else if (!squad.benchOpen) {
    throw new Error("Fill your starting lineup before drafting bench players");
  }

  await prisma.$transaction([
    prisma.draftPick.create({
      data: {
        draftId,
        pickNumber: draft.currentPick,
        round,
        teamId: onTheClock.id,
        playerId,
        slotId,
      },
    }),
    prisma.draft.update({
      where: { id: draftId },
      data: { currentPick: draft.currentPick + 1 },
    }),
  ]);

  await advanceDraft(draftId);

  revalidatePath(`/draft/${draftId}`);
}

export async function makeCoachPick(formData: FormData) {
  const draftId = Number.parseInt(String(formData.get("draftId")), 10);
  const coachId = Number.parseInt(String(formData.get("coachId")), 10);
  if (!draftId || !coachId) throw new Error("Missing draftId or coachId");

  const draft = await prisma.draft.findUniqueOrThrow({ where: { id: draftId } });
  if (draft.status !== "in_progress") return;
  if (draft.coachEnabled === false) {
    throw new Error("Coaches are off for this draft");
  }

  const { teamCount } = await draftTotals(draftId);
  const teams = await prisma.team.findMany({
    where: { draftId },
    orderBy: { draftOrder: "asc" },
  });
  const { draftOrder } = pickInfo(draft.currentPick, teamCount);
  const onTheClock = teams.find((t) => t.draftOrder === draftOrder);

  if (!onTheClock || onTheClock.id !== draft.userTeamId) {
    throw new Error("Not your turn");
  }

  if (await teamHasCoach(draftId, onTheClock.id)) {
    throw new Error("You already have a coach");
  }

  const draftedCoachIds = await getDraftedCoachIds(draftId);
  if (draftedCoachIds.includes(coachId)) {
    throw new Error("Coach already drafted");
  }

  await prisma.coachPick.create({
    data: {
      draftId,
      pickNumber: draft.currentPick,
      teamId: onTheClock.id,
      coachId,
    },
  });

  await prisma.draft.update({
    where: { id: draftId },
    data: { currentPick: draft.currentPick + 1 },
  });

  await advanceDraft(draftId);

  revalidatePath(`/draft/${draftId}`);
}

function loadSeason(id: number) {
  return prisma.draft.findUnique({
    where: { id },
    include: {
      userTeam: true,
      teams: { orderBy: { draftOrder: "asc" } },
      coaches: true,
      nextSeason: { select: { id: true } },
    },
  });
}

type FinishedSeason = NonNullable<Awaited<ReturnType<typeof loadSeason>>>;

/** Same competition, fresh draft — used by the opt-in 7s ladder. */
async function cloneSevensSeason(args: {
  previous: FinishedSeason;
  nextDivision: number;
}): Promise<number> {
  const { previous, nextDivision } = args;
  const formations = formationsForMode("sevens");

  return prisma.$transaction(
    async (tx) => {
      const nextDraft = await tx.draft.create({
        data: {
          leagues: previous.leagues,
          years: previous.years,
          formation: previous.formation,
          gameMode: "sevens",
          divisionsEnabled: true,
          division: nextDivision,
          seasonNumber: previous.seasonNumber + 1,
          previousSeasonDraftId: previous.id,
          cardPacksEnabled: previous.cardPacksEnabled,
          chemistryEnabled: previous.chemistryEnabled,
          coachEnabled: previous.coachEnabled,
          ageEnabled: previous.ageEnabled,
          potentialEnabled: previous.potentialEnabled,
          fitEnabled: previous.fitEnabled,
        },
      });

      await tx.team.createMany({
        data: previous.teams.map((team) => ({
          draftId: nextDraft.id,
          league: team.league,
          name: team.name,
          shortName: team.shortName,
          slug: team.slug,
          clubId: team.clubId,
          draftOrder: team.draftOrder,
          formation:
            team.id === previous.userTeamId
              ? previous.formation
              : shuffled(formations)[0].key,
        })),
      });

      if (previous.coaches.length > 0) {
        await tx.coach.createMany({
          data: previous.coaches.map((coach) => ({
            draftId: nextDraft.id,
            name: coach.name,
            club: coach.club,
            clubId: coach.clubId,
            rating: coach.rating,
          })),
        });
      }

      const carried = await tx.team.findFirst({
        where: { draftId: nextDraft.id, slug: previous.userTeam!.slug },
        select: { id: true },
      });
      if (!carried) throw new Error("Could not carry your club into the next season");

      await tx.draft.update({
        where: { id: nextDraft.id },
        data: { userTeamId: carried.id, status: "rolling_pick" },
      });
      return nextDraft.id;
    },
    { timeout: 20000 },
  );
}

/** A brand new field drawn from the division you've just earned. */
async function createCareerSeason(args: {
  previous: FinishedSeason;
  rules: ReturnType<typeof scoringRulesFromDraft>;
  nextDivision: number;
  keepClub: KeptClub;
}): Promise<number> {
  const { previous, rules, nextDivision, keepClub } = args;
  const scope = divisionScope(nextDivision);

  const nextDraftId = await createDraft({
    leagues: scope.leagues,
    years: rollDivisionYears(nextDivision, await availablePlayerYears()),
    totalTeams: scope.teamCount,
    formation: previous.formation,
    gameMode: previous.gameMode === "career11" ? "career11" : "career",
    // Careers created before public profiles still remain playable.
    username: previous.username ?? "Manager",
    careerKey: previous.careerKey ?? `legacy-${previous.id}`,
    rules,
    divisionsEnabled: true,
    division: nextDivision,
    seasonNumber: previous.seasonNumber + 1,
    previousSeasonDraftId: previous.id,
    cardPacksEnabled: previous.cardPacksEnabled,
    keepClub,
  });

  const field = await prisma.team.findMany({
    where: { draftId: nextDraftId },
    select: { id: true, clubId: true, name: true },
  });
  const carried =
    field.find((team) =>
      keepClub.clubId != null ? team.clubId === keepClub.clubId : team.name === keepClub.name,
    ) ?? field.find((team) => team.name === keepClub.name);
  if (!carried) throw new Error("Could not carry your club into the next season");

  await prisma.draft.update({
    where: { id: nextDraftId },
    data: { userTeamId: carried.id, status: "rolling_pick" },
  });

  return nextDraftId;
}

export async function startNextSeason(formData: FormData) {
  const previousDraftId = Number.parseInt(String(formData.get("draftId")), 10);
  if (!previousDraftId) throw new Error("Missing draftId");

  const previous = await loadSeason(previousDraftId);
  if (!previous) throw new Error("Season not found");
  if (
    previous.status !== "complete" ||
    (previous.gameMode !== "sevens" && !isCareerMode(previous.gameMode)) ||
    !previous.divisionsEnabled ||
    !previous.userTeamId ||
    !previous.userTeam
  ) {
    throw new Error("This draft cannot start another division season");
  }
  if (previous.nextSeason) redirect(`/draft/${previous.nextSeason.id}/pick-team`);

  const [picks, coachPicks] = await Promise.all([
    prisma.draftPick.findMany({
      where: { draftId: previousDraftId },
      orderBy: { pickNumber: "asc" },
      select: {
        teamId: true,
        slotId: true,
        player: {
          select: {
            id: true,
            overall: true,
            potential: true,
            age: true,
            positions: true,
            club: true,
            league: true,
            nationality: true,
          },
        },
      },
    }),
    prisma.coachPick.findMany({
      where: { draftId: previousDraftId },
      select: { teamId: true, coach: { select: { rating: true } } },
    }),
  ]);
  const picksByTeam = new Map<number, typeof picks>();
  for (const pick of picks) {
    const teamPicks = picksByTeam.get(pick.teamId) ?? [];
    teamPicks.push(pick);
    picksByTeam.set(pick.teamId, teamPicks);
  }
  const coachByTeam = new Map(coachPicks.map((pick) => [pick.teamId, pick.coach.rating]));
  const rules = scoringRulesFromDraft(previous);
  const leaderboard = previous.teams
    .map((team) => ({
      teamId: team.id,
      rating: evaluateSquad(
        team.formation,
        picksByTeam.get(team.id) ?? [],
        coachByTeam.get(team.id),
        rules,
      ).rating.rating,
    }))
    .sort((a, b) => b.rating - a.rating);
  const rank = leaderboard.findIndex((team) => team.teamId === previous.userTeamId) + 1;
  if (rank < 1) throw new Error("Could not rank the completed season");
  const outcome = seasonOutcome(rank, previous.teams.length, previous.division);

  const userTeam = previous.userTeam;

  let nextDraftId: number;
  try {
    // Career rebuilds the whole field, because the new division changes the
    // leagues, the years and the field size. The opt-in 7s ladder keeps the
    // exact same competition and just re-runs the draft.
    nextDraftId =
      isCareerMode(previous.gameMode)
        ? await createCareerSeason({
            previous,
            rules,
            nextDivision: outcome.nextDivision,
            keepClub: {
              league: userTeam.league,
              name: userTeam.name,
              shortName: userTeam.shortName,
              clubId: userTeam.clubId,
            },
          })
        : await cloneSevensSeason({ previous, nextDivision: outcome.nextDivision });
  } catch (error) {
    const isDuplicate =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002";
    if (!isDuplicate) throw error;
    const existing = await prisma.draft.findUnique({
      where: { previousSeasonDraftId: previousDraftId },
      select: { id: true },
    });
    if (!existing) throw error;
    nextDraftId = existing.id;
  }

  redirect(`/draft/${nextDraftId}/pick-team`);
}
