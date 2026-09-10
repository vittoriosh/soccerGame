/**
 * Sanity harness for the end-of-draft hindsight optimiser.
 *
 *   npx tsx scripts/sim-hindsight.ts <draftId>
 *
 * Prints the user's real squad rating next to the best squad their pick
 * numbers could have reached, plus the ideal XI, so the gap can be eyeballed
 * for plausibility (it must never be negative, and never absurdly large).
 */
import { prisma } from "../src/lib/db";
import { ROUNDS, parseDraftYears, pickInfo } from "../src/lib/draft";
import { assignSquadToFormation, getFormation, positionFit } from "../src/lib/formations";
import { applyCoachChemistryBoost, computeSquadChemistry } from "../src/lib/chemistry";
import { computeSquadRating, slotEffectiveRating } from "../src/lib/team-rating";
import { bestPossibleSquad, type PoolCoach, type PoolPlayer } from "../src/lib/hindsight";

const BENCH_PICKS = ROUNDS - 1 - 11;

async function main() {
  const draftId = Number(process.argv[2]);
  const draft = await prisma.draft.findUnique({
    where: { id: draftId },
    include: { userTeam: true },
  });
  if (!draft?.userTeam) throw new Error(`draft ${draftId} has no user team`);

  const teamCount = await prisma.team.count({ where: { draftId } });
  const totalPicks = teamCount * ROUNDS;
  const formation = getFormation(draft.userTeam.formation);

  const allPicks = await prisma.draftPick.findMany({ where: { draftId } });
  const allCoachPicks = await prisma.coachPick.findMany({
    where: { draftId },
    include: { coach: true },
  });

  const userPicks: number[] = [];
  for (let p = 1; p <= totalPicks; p++) {
    if (pickInfo(p, teamCount).draftOrder === draft.userTeam.draftOrder) userPicks.push(p);
  }

  const deadline = new Map<number, number>();
  for (const pick of allPicks) {
    if (pick.teamId === draft.userTeamId) continue;
    const known = deadline.get(pick.playerId);
    if (known === undefined || pick.pickNumber < known) deadline.set(pick.playerId, pick.pickNumber);
  }
  const coachDeadline = new Map<number, number>();
  for (const pick of allCoachPicks) {
    if (pick.teamId === draft.userTeamId) continue;
    const known = coachDeadline.get(pick.coachId);
    if (known === undefined || pick.pickNumber < known) coachDeadline.set(pick.coachId, pick.pickNumber);
  }

  const pool = await prisma.player.findMany({
    where: { league: { in: draft.leagues.split(",") }, year: { in: parseDraftYears(draft.years) } },
    orderBy: { overall: "desc" },
    take: 300,
  });
  const coachPool = await prisma.coach.findMany({ where: { draftId } });

  const first = userPicks[0];
  const players: PoolPlayer[] = pool
    .map((p) => ({ ...p, deadline: deadline.get(p.id) ?? Infinity }))
    .filter((p) => p.deadline > first);
  const coaches: PoolCoach[] = coachPool
    .map((c) => ({ ...c, deadline: coachDeadline.get(c.id) ?? Infinity }))
    .filter((c) => c.deadline > first);

  // Actual squad, scored the same way the page scores it.
  const mySquad = await prisma.draftPick.findMany({
    where: { draftId, teamId: draft.userTeamId! },
    include: { player: true },
    orderBy: { pickNumber: "asc" },
  });
  const myCoach = allCoachPicks.find((p) => p.teamId === draft.userTeamId)?.coach;
  const { starters, bench } = assignSquadToFormation(
    mySquad.map((p) => ({ player: p.player, slotId: p.slotId })),
    formation,
  );
  const slotByPlayer = new Map<number, string>();
  for (const [slotId, player] of starters) slotByPlayer.set(player.id, slotId);
  const chem = applyCoachChemistryBoost(
    computeSquadChemistry(
      [...starters.values(), ...bench].map((p) => ({ ...p, slotId: slotByPlayer.get(p.id) ?? null })),
      formation,
    ),
    myCoach?.rating,
  );
  const actual = computeSquadRating({
    formation,
    starters,
    bench,
    chemistry: chem,
    coachRating: myCoach?.rating,
  });

  const started = Date.now();
  const best = bestPossibleSquad({
    formation,
    userPicks,
    players,
    coaches,
    benchSlots: BENCH_PICKS,
  });
  const elapsed = Date.now() - started;
  if (!best) throw new Error("optimiser returned nothing");

  console.log(
    `draft ${draftId} · ${draft.userTeam.shortName} · ${formation.name} · picks ${userPicks.join(",")}`,
  );
  console.log(`pool ${players.length} players / ${coaches.length} coaches · solved in ${elapsed}ms`);
  console.log(`actual ${actual.rating.toFixed(1)}  →  best possible ${best.rating.toFixed(1)}`);
  console.log(`ideal coach: ${best.coach?.name ?? "none"} (${best.coach?.rating ?? "-"})`);

  console.table(
    formation.slots.map((slot) => {
      const player = best.starters.get(slot.id);
      const mine = starters.get(slot.id);
      const mineSlot = actual.slots.find((s) => s.slotId === slot.id);
      return {
        slot: slot.code,
        ideal: player ? `${player.name} ${player.overall}` : "-",
        idealEff: player
          ? slotEffectiveRating(
              player,
              slot.code,
              best.chemistry.get(player.id) ?? 0,
              best.coach?.rating,
            ).effective
          : "-",
        fit: player ? positionFit(player.positions, slot.code) : "-",
        deadline: player ? (player.deadline === Infinity ? "open" : player.deadline) : "-",
        yours: mine ? `${mine.name} ${mine.overall}` : "-",
        yourEff: mineSlot ? mineSlot.effective : "-",
        yourFit: mineSlot?.fit ?? "-",
      };
    }),
  );
  console.log(
    "ideal bench:",
    best.bench.map((p) => `${p.name} ${p.overall}`).join(", ") || "none",
  );

  // Every ideal pick must have been genuinely reachable from one of the
  // user's own turns, tightest deadline first.
  const deadlines = [
    ...[...best.starters.values(), ...best.bench].map((p) => p.deadline),
    ...(best.coach ? [best.coach.deadline] : []),
  ].sort((a, b) => a - b);
  const legal = deadlines.every((d, i) => d > userPicks[i]);
  console.log(`reachable: ${legal ? "yes" : "NO — BUG"} (${deadlines.length} picks used)`);
  if (best.rating < actual.rating) console.log("WARNING: best < actual, optimiser is under-solving");
}

main().finally(() => prisma.$disconnect());
