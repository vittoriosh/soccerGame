"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { STARTING_CASH } from "@/lib/packs";

export async function startPackRun() {
  const run = await prisma.packRun.create({ data: { cash: STARTING_CASH } });
  redirect(`/packs/${run.id}`);
}
