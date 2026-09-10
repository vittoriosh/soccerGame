/**
 * Plays a live draft from the user's side, exercising the same slot rules
 * makePick enforces: fill the eleven first (choosing a slot for every
 * pick), then the bench, then the coach.
 *
 *   npx tsx scripts/sim-user-picks.ts <draftId> [pickCount]
 *
 * With no count it plays the draft out and then checks that dropping a
 * second player into an occupied slot is genuinely impossible; with a count
 * it stops early, which is how to get a half-finished board to look at.
 */
import { prisma } from "../src/lib/db";
import { ROUNDS, advanceDraft, draftTotals, getTeamSquadState, pickInfo } from "../src/lib/draft";
import { positionFit, FIT_LABELS } from "../src/lib/formations";

const draftId = Number.parseInt(process.argv[2] ?? "0", 10);
const pickCount = process.argv[3] ? Number.parseInt(process.argv[3], 10) : Infinity;

async function main() {
  let draft = await prisma.draft.findUniqueOrThrow({ where: { id: draftId } });
  const teamId = draft.userTeamId!;
  const team = await prisma.team.findUniqueOrThrow({ where: { id: teamId } });
  const { teamCount, totalPicks } = await draftTotals(draftId);
  const leagues = draft.leagues.split(",");
  const years = draft.years.split(",").map(Number);

  console.log(`playing as ${team.shortName} (${team.formation}), ${teamCount} teams`);

  let made = 0;
  while (draft.status === "in_progress" && made < Math.min(pickCount, ROUNDS)) {
    made++;
    const { round, draftOrder } = pickInfo(draft.currentPick, teamCount);
    if (draftOrder !== team.draftOrder) {
      throw new Error(`not on the clock at pick ${draft.currentPick} — advanceDraft stalled`);
    }

    const squad = await getTeamSquadState(draftId, teamId, team.formation);
    const hasCoach = (await prisma.coachPick.count({ where: { draftId, teamId } })) > 0;
    const drafted = (
      await prisma.draftPick.findMany({ where: { draftId }, select: { playerId: true } })
    ).map((p) => p.playerId);

    if ((round === ROUNDS && !hasCoach) || (squad.benchOpen && squad.picksMade >= ROUNDS - 1)) {
      const coach = await prisma.coach.findFirstOrThrow({
        where: { draftId, coachPicks: { none: {} } },
        orderBy: { rating: "desc" },
      });
      await prisma.coachPick.create({
        data: { draftId, pickNumber: draft.currentPick, teamId, coachId: coach.id },
      });
      console.log(`R${round}: hired ${coach.name} (${coach.rating})`);
    } else {
      const slot = squad.openSlots[0] ?? null;
      const player = await prisma.player.findFirstOrThrow({
        where: {
          id: { notIn: drafted },
          league: { in: leagues },
          year: { in: years },
          ...(slot
            ? {
                OR: [
                  { positionGroup: slot.group },
                  { positions: { contains: slot.code } },
                ],
              }
            : {}),
        },
        orderBy: { overall: "desc" },
      });
      await prisma.draftPick.create({
        data: {
          draftId,
          pickNumber: draft.currentPick,
          round,
          teamId,
          playerId: player.id,
          slotId: slot?.id ?? null,
        },
      });
      console.log(
        `R${round}: ${slot ? slot.id.padEnd(4) : "SUB "} ${player.name} (${player.overall}, ${player.positions})` +
          (slot ? ` — ${FIT_LABELS[positionFit(player.positions, slot.code)]}` : ""),
      );
    }

    await prisma.draft.update({
      where: { id: draftId },
      data: { currentPick: draft.currentPick + 1 },
    });
    draft = await advanceDraft(draftId);
  }

  const squad = await getTeamSquadState(draftId, teamId, team.formation);
  console.log(
    `\nstatus ${draft.status} at ${draft.currentPick}/${totalPicks}, ` +
      `XI ${squad.filled.size}/11, bench ${squad.benchCount}`,
  );

  if (pickCount === Infinity) {
    const takenSlot = [...squad.filled.keys()][0];
    const dupe = await prisma.draftPick
      .create({
        data: { draftId, pickNumber: 9999, round: 99, teamId, playerId: 1, slotId: takenSlot },
      })
      .then(() => "ACCEPTED (bug)")
      .catch((e) => `rejected (${e.constructor.name})`);
    console.log(`duplicate ${takenSlot} pick: ${dupe}`);
  }
}

main().finally(() => prisma.$disconnect());
