"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { ROUNDS } from "@/lib/draft";
import { tradeInPlayersForPacks, choosePackPlayer } from "@/lib/card-packs";

export async function tradeIn(formData: FormData) {
  const draftId = Number.parseInt(String(formData.get("draftId")), 10);
  const tradedPlayerIds = formData
    .getAll("tradedPlayerIds")
    .map((v) => Number.parseInt(String(v), 10))
    .filter(Boolean);

  const draft = await prisma.draft.findUniqueOrThrow({ where: { id: draftId } });
  if (!draft.userTeamId) throw new Error("No team chosen yet");
  if (draft.status !== "complete") throw new Error("Finish the draft first");

  if (tradedPlayerIds.length > 0) {
    // Post-completion, so "round" is just a record of when the trade
    // happened — ROUNDS marks it as a final, after-the-draft trade.
    await tradeInPlayersForPacks(draftId, draft.userTeamId, ROUNDS, tradedPlayerIds);
  }

  redirect(tradedPlayerIds.length > 0 ? `/draft/${draftId}/packs` : `/draft/${draftId}`);
}

export async function openPack(formData: FormData) {
  const draftId = Number.parseInt(String(formData.get("draftId")), 10);
  const packId = Number.parseInt(String(formData.get("packId")), 10);
  const chosenPlayerId = Number.parseInt(String(formData.get("chosenPlayerId")), 10);

  await choosePackPlayer(packId, chosenPlayerId);

  redirect(`/draft/${draftId}/packs`);
}
