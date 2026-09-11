import { prisma } from "../src/lib/db";
import { Prisma } from "../src/generated/prisma/client";
import { createDraft, availablePlayerYears } from "../src/lib/create-draft";
import { divisionScope, rollDivisionYears } from "../src/lib/season-divisions";
import { DEFAULT_SCORING_RULES } from "../src/lib/scoring-rules";
import { DEFAULT_FORMATION_KEY, DEFAULT_SEVENS_FORMATION_KEY } from "../src/lib/formations";
import { shuffled } from "../src/lib/league-data";
import { advanceDraft, roundsForDraft } from "../src/lib/draft";
import { recordCareerResult } from "../src/lib/career-leaderboard";

async function main() {
  // `drop <id>` removes a draft this script created, so a kept fixture can
  // be inspected in the browser and then cleared without hand-written SQL.
  if (process.argv[2] === "drop") {
    await cleanup(Number(process.argv[3]));
    console.log("dropped", process.argv[3]);
    return;
  }

  const keep = process.argv.includes("--keep");
  const eleven = process.argv.includes("--11");
  const division = Number(process.argv[2] ?? 5);
  const scope = divisionScope(division);
  const years = rollDivisionYears(division, await availablePlayerYears());
  console.log(`division ${division}:`, scope.leagues.join(" + "), "years", years.join(","));

  const t0 = Date.now();
  const draftId = await createDraft({
    leagues: scope.leagues,
    years,
    totalTeams: scope.teamCount,
    formation: eleven ? DEFAULT_FORMATION_KEY : DEFAULT_SEVENS_FORMATION_KEY,
    gameMode: eleven ? "career11" : "career",
    username: "Smoke Test",
    careerKey: `smoke-${Date.now()}`,
    rules: DEFAULT_SCORING_RULES,
    divisionsEnabled: true,
    division,
    seasonNumber: 1,
  });
  const teams = await prisma.team.findMany({
    where: { draftId },
    orderBy: { id: "asc" },
    select: { id: true, league: true },
  });
  const coaches = await prisma.coach.count({ where: { draftId } });
  const perLeague = scope.leagues
    .map((l) => `${l}:${teams.filter((t) => t.league === l).length}`)
    .join(" ");
  console.log(
    `created draft ${draftId} in ${Date.now() - t0}ms — ${teams.length}/${scope.teamCount} teams, ${coaches} coaches`,
  );
  console.log(`  ${perLeague}`);
  if (teams.length !== scope.teamCount) console.log("  WARNING: field short of target");
  if (coaches < teams.length) console.log("  WARNING: fewer coaches than clubs");

  const orders = shuffled(teams.map((_, i) => i + 1));
  const t1 = Date.now();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE "Team" SET "draftOrder" = -"draftOrder" WHERE "draftId" = ${draftId}
    `;
    await tx.$executeRaw`
      UPDATE "Team" SET "draftOrder" = CASE "id"
      ${Prisma.join(
        teams.map((team, i) => Prisma.sql`WHEN ${team.id}::int THEN ${orders[i]}::int`),
        " ",
      )}
      END WHERE "draftId" = ${draftId}
    `;
    await tx.draft.update({ where: { id: draftId }, data: { status: "pick_revealed" } });
  });
  console.log(`rolled pick order in ${Date.now() - t1}ms`);

  const after = await prisma.team.findMany({
    where: { draftId },
    orderBy: { draftOrder: "asc" },
    select: { draftOrder: true },
  });
  const seen = new Set(after.map((t) => t.draftOrder));
  console.log(
    `orders: ${after.length} rows, ${seen.size} distinct, min ${after[0].draftOrder}, max ${after[after.length - 1].draftOrder}`,
  );

  // `--full` lets the CPU run the entire board, which is the real test that
  // a 100-club field can finish rather than run a position group dry.
  if (process.argv.includes("--full")) {
    await prisma.draft.update({
      where: { id: draftId },
      data: { status: "in_progress", currentPick: 1 },
    });
    const t2 = Date.now();
    await advanceDraft(draftId);
    const state = await prisma.draft.findUniqueOrThrow({ where: { id: draftId } });
    const [playerPicks, coachPicks] = await Promise.all([
      prisma.draftPick.count({ where: { draftId } }),
      prisma.coachPick.count({ where: { draftId } }),
    ]);
    const rounds = roundsForDraft(state);
    console.log(
      `simulated: ${state.status} at pick ${state.currentPick}/${teams.length * rounds} in ${Date.now() - t2}ms`,
    );
    console.log(`  ${playerPicks} player picks + ${coachPicks} coach picks`);
    if (state.status !== "complete") console.log("  WARNING: draft did not finish");
    if (coachPicks !== teams.length) console.log("  WARNING: not every club hired a coach");
    await prisma.draft.update({
      where: { id: draftId },
      data: { userTeamId: teams[0].id },
    });
    await recordCareerResult(draftId);
    const result = await prisma.careerResult.findUnique({ where: { draftId } });
    console.log(`  leaderboard result: ${result?.username} ${result?.teamScore}`);
    if (!result) console.log("  WARNING: leaderboard result missing");
    await cleanup(draftId);
    console.log("cleaned up");
    return;
  }

  if (keep) {
    await prisma.draft.update({
      where: { id: draftId },
      data: { status: "selecting_team" },
    });
    console.log(`kept draft ${draftId} at /draft/${draftId}/pick-team`);
    return;
  }

  await cleanup(draftId);
  console.log("cleaned up");
}

async function cleanup(draftId: number) {
  await prisma.careerResult.deleteMany({ where: { draftId } });
  await prisma.draft.update({ where: { id: draftId }, data: { userTeamId: null } });
  await prisma.coachPick.deleteMany({ where: { draftId } });
  await prisma.draftPick.deleteMany({ where: { draftId } });
  await prisma.coach.deleteMany({ where: { draftId } });
  await prisma.team.deleteMany({ where: { draftId } });
  await prisma.draft.delete({ where: { id: draftId } });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
