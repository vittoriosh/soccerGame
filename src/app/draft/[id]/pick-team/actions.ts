"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { advanceDraft } from "@/lib/draft";
import { shuffled } from "@/lib/league-data";

export async function chooseTeam(formData: FormData) {
  const draftId = Number.parseInt(String(formData.get("draftId")), 10);
  const teamId = Number.parseInt(String(formData.get("teamId")), 10);
  if (!draftId || !teamId) throw new Error("Missing draftId or teamId");

  const draft = await prisma.draft.findUniqueOrThrow({ where: { id: draftId } });
  if (draft.userTeamId) throw new Error("Team already chosen");
  if (draft.status !== "selecting_team") throw new Error("Draft is not accepting a club pick");

  const team = await prisma.team.findUniqueOrThrow({ where: { id: teamId } });
  if (team.draftId !== draftId) throw new Error("Team is not part of this draft");

  await prisma.$transaction([
    // CPU clubs each get their own shape at setup; whichever club the user
    // takes over adopts the formation they locked in instead.
    prisma.team.update({ where: { id: teamId }, data: { formation: draft.formation } }),
    prisma.draft.update({
      where: { id: draftId },
      data: { userTeamId: teamId, status: "rolling_pick" },
    }),
  ]);

  redirect(`/draft/${draftId}/pick-team`);
}

/** Randomly reassigns snake-draft slots among every club, then starts the draft. */
export async function rollPickOrder(formData: FormData) {
  const draftId = Number.parseInt(String(formData.get("draftId")), 10);
  if (!draftId) throw new Error("Missing draftId");

  const draft = await prisma.draft.findUniqueOrThrow({ where: { id: draftId } });
  if (!draft.userTeamId) throw new Error("Choose a club first");
  if (draft.status !== "rolling_pick") {
    if (draft.status === "pick_revealed" && draft.userTeamId) {
      const userTeam = await prisma.team.findUniqueOrThrow({ where: { id: draft.userTeamId } });
      return {
        draftOrder: userTeam.draftOrder,
        teamCount: await prisma.team.count({ where: { draftId } }),
      };
    }
    if (draft.status === "in_progress" || draft.status === "complete") {
      redirect(`/draft/${draftId}`);
    }
    throw new Error("Not ready to roll");
  }

  const userTeamId = draft.userTeamId;

  await prisma.$transaction(async (tx) => {
    const teams = await tx.team.findMany({
      where: { draftId },
      orderBy: { id: "asc" },
    });
    const orders = shuffled(teams.map((t) => t.draftOrder));

    // Unique (draftId, draftOrder) — park on negatives, then write finals.
    for (let i = 0; i < teams.length; i++) {
      await tx.team.update({
        where: { id: teams[i].id },
        data: { draftOrder: -(i + 1) },
      });
    }
    for (let i = 0; i < teams.length; i++) {
      await tx.team.update({
        where: { id: teams[i].id },
        data: { draftOrder: orders[i] },
      });
    }

    // Stay off the live board until the player has seen their slot — if
    // we flipped to in_progress here, the pick-team page would refresh
    // and yank them away while the number was still spinning.
    await tx.draft.update({
      where: { id: draftId },
      data: { status: "pick_revealed" },
    });
  });

  const userTeam = await prisma.team.findUniqueOrThrow({ where: { id: userTeamId } });
  return { draftOrder: userTeam.draftOrder, teamCount: await prisma.team.count({ where: { draftId } }) };
}

/** After the roll has been shown, open the live board. */
export async function beginDraft(formData: FormData) {
  const draftId = Number.parseInt(String(formData.get("draftId")), 10);
  if (!draftId) throw new Error("Missing draftId");

  const draft = await prisma.draft.findUniqueOrThrow({ where: { id: draftId } });
  if (draft.status === "in_progress" || draft.status === "complete") {
    redirect(`/draft/${draftId}`);
  }
  if (draft.status !== "pick_revealed") {
    throw new Error("Roll for a pick first");
  }

  await prisma.draft.update({
    where: { id: draftId },
    data: { status: "in_progress", currentPick: 1 },
  });
  await advanceDraft(draftId);
  redirect(`/draft/${draftId}`);
}
