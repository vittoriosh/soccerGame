import { prisma } from "@/lib/db";

/**
 * Drops the heavy per-draft rows after a career result is recorded.
 * Keeps the Draft stub so CareerResult.draftId stays valid.
 */
export async function stripDraftPayload(draftId: number) {
  await prisma.$transaction([
    prisma.draft.update({
      where: { id: draftId },
      data: { userTeamId: null },
    }),
    prisma.cardPack.deleteMany({ where: { draftId } }),
    prisma.draftPick.deleteMany({ where: { draftId } }),
    prisma.coachPick.deleteMany({ where: { draftId } }),
    prisma.coach.deleteMany({ where: { draftId } }),
    prisma.team.deleteMany({ where: { draftId } }),
  ]);
}
