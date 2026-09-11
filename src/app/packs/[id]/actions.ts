"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  getPackTier,
  generatePackCandidates,
  generateCoachPackCandidates,
  PICKS_PER_POSITION,
  SQUAD_SIZE,
  type PackOpeningPayload,
} from "@/lib/packs";
import { POSITION_GROUPS, STARTER_CAPS, type PositionGroup } from "@/lib/positions";
import type { Prisma } from "@/generated/prisma/client";
import { assertPacksEnabled } from "@/lib/features";

async function assertCanBuy(packRunId: number, tierKey: string) {
  assertPacksEnabled();
  const run = await prisma.packRun.findUniqueOrThrow({ where: { id: packRunId } });
  if (run.status !== "in_progress") throw new Error("This squad is already finished");

  const openPending = await prisma.packOpening.findFirst({ where: { packRunId } });
  if (openPending) throw new Error("Open your current pack before buying another");

  const tier = getPackTier(tierKey);
  if (run.cash < tier.price) throw new Error("Not enough cash for that pack");

  return { run, tier };
}

/** The squad is complete once every field slot AND the coach slot are
 *  filled — not the moment a coach is hired, so hiring one early (or at
 *  any point) doesn't lock the player out of filling the rest of the
 *  pitch afterward. */
async function maybeCompleteRun(tx: Prisma.TransactionClient, packRunId: number) {
  const [squadCount, run] = await Promise.all([
    tx.packPlayer.count({ where: { packRunId } }),
    tx.packRun.findUniqueOrThrow({ where: { id: packRunId } }),
  ]);
  if (squadCount >= SQUAD_SIZE && run.coachName && run.status !== "complete") {
    await tx.packRun.update({ where: { id: packRunId }, data: { status: "complete" } });
  }
}

export async function buyPack(formData: FormData) {
  const packRunId = Number.parseInt(String(formData.get("packRunId")), 10);
  const tierKey = String(formData.get("tier"));
  const positionGroup = String(formData.get("positionGroup")) as PositionGroup;
  if (!POSITION_GROUPS.includes(positionGroup)) throw new Error("Invalid position group");

  const { run, tier } = await assertCanBuy(packRunId, tierKey);

  const filled = await prisma.packPlayer.count({ where: { packRunId, positionGroup } });
  if (filled >= STARTER_CAPS[positionGroup]) throw new Error("That slot is already full");

  const owned = await prisma.packPlayer.findMany({ where: { packRunId }, select: { playerId: true } });
  const excludeIds = new Set(owned.map((p) => p.playerId));

  const items = await generatePackCandidates(tierKey, positionGroup, excludeIds);
  if (items.length === 0) throw new Error("No players available for that position right now");

  const payload: PackOpeningPayload = { kind: "player", positionGroup, items };

  await prisma.$transaction([
    prisma.packRun.update({ where: { id: packRunId }, data: { cash: run.cash - tier.price } }),
    prisma.packOpening.create({
      data: { packRunId, tier: tierKey, candidates: JSON.stringify(payload) },
    }),
  ]);

  redirect(`/packs/${packRunId}`);
}

export async function buyCoachPack(formData: FormData) {
  const packRunId = Number.parseInt(String(formData.get("packRunId")), 10);
  const tierKey = String(formData.get("tier"));

  const { run, tier } = await assertCanBuy(packRunId, tierKey);

  const items = generateCoachPackCandidates(tierKey);
  if (items.length === 0) throw new Error("No coaches available right now");

  const payload: PackOpeningPayload = { kind: "coach", items };

  await prisma.$transaction([
    prisma.packRun.update({ where: { id: packRunId }, data: { cash: run.cash - tier.price } }),
    prisma.packOpening.create({
      data: { packRunId, tier: tierKey, candidates: JSON.stringify(payload) },
    }),
  ]);

  redirect(`/packs/${packRunId}`);
}

export async function resolveOpening(formData: FormData) {
  assertPacksEnabled();
  const packRunId = Number.parseInt(String(formData.get("packRunId")), 10);
  const openingId = Number.parseInt(String(formData.get("openingId")), 10);
  const selectedPlayerIds = formData
    .getAll("selected")
    .map((v) => Number.parseInt(String(v), 10))
    .filter(Boolean);

  const opening = await prisma.packOpening.findUniqueOrThrow({ where: { id: openingId } });
  if (opening.packRunId !== packRunId) throw new Error("Pack mismatch");

  const payload: PackOpeningPayload = JSON.parse(opening.candidates);
  if (payload.kind !== "player") throw new Error("This pack isn't a player pack");

  const selected = payload.items.filter((c) => selectedPlayerIds.includes(c.playerId));
  if (selected.length !== selectedPlayerIds.length) {
    throw new Error("One of those picks isn't in this pack");
  }
  if (selected.length > PICKS_PER_POSITION) {
    throw new Error(`You can only keep ${PICKS_PER_POSITION} from one pack`);
  }

  const filled = await prisma.packPlayer.count({
    where: { packRunId, positionGroup: payload.positionGroup },
  });
  if (filled + selected.length > STARTER_CAPS[payload.positionGroup]) {
    throw new Error("That slot is already full");
  }

  await prisma.$transaction(async (tx) => {
    for (const c of selected) {
      await tx.packPlayer.create({
        data: {
          packRunId,
          playerId: c.playerId,
          positionGroup: c.positionGroup,
          color: c.color,
          boost: c.boost,
        },
      });
    }
    await tx.packOpening.delete({ where: { id: openingId } });
    await maybeCompleteRun(tx, packRunId);
  });

  redirect(`/packs/${packRunId}`);
}

export async function resolveCoachOpening(formData: FormData) {
  assertPacksEnabled();
  const packRunId = Number.parseInt(String(formData.get("packRunId")), 10);
  const openingId = Number.parseInt(String(formData.get("openingId")), 10);
  const selectedNameRaw = formData.get("selected");
  const selectedName = selectedNameRaw ? String(selectedNameRaw) : null;

  const opening = await prisma.packOpening.findUniqueOrThrow({ where: { id: openingId } });
  if (opening.packRunId !== packRunId) throw new Error("Pack mismatch");

  const payload: PackOpeningPayload = JSON.parse(opening.candidates);
  if (payload.kind !== "coach") throw new Error("This pack isn't a coach pack");

  if (selectedName) {
    const coach = payload.items.find((c) => c.name === selectedName);
    if (!coach) throw new Error("That coach isn't in this pack");

    await prisma.$transaction(async (tx) => {
      await tx.packRun.update({
        where: { id: packRunId },
        data: {
          coachName: coach.name,
          coachClub: coach.club,
          coachClubId: coach.clubId,
          coachRating: coach.rating,
        },
      });
      await tx.packOpening.delete({ where: { id: openingId } });
      await maybeCompleteRun(tx, packRunId);
    });
  } else {
    await prisma.packOpening.delete({ where: { id: openingId } });
  }

  redirect(`/packs/${packRunId}`);
}

export async function skipOpening(formData: FormData) {
  assertPacksEnabled();
  const packRunId = Number.parseInt(String(formData.get("packRunId")), 10);
  const openingId = Number.parseInt(String(formData.get("openingId")), 10);
  await prisma.packOpening.delete({ where: { id: openingId } });
  redirect(`/packs/${packRunId}`);
}
