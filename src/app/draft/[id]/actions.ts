"use server";

import { revalidatePath } from "next/cache";
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
