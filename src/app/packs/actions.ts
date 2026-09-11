"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { STARTING_CASH } from "@/lib/packs";
import { assertPacksEnabled } from "@/lib/features";

export async function startPackRun() {
  assertPacksEnabled();
  const run = await prisma.packRun.create({ data: { cash: STARTING_CASH } });
  redirect(`/packs/${run.id}`);
}
