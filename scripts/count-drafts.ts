import { prisma } from "../src/lib/db";

async function main() {
  const [total, byStatus, byMode, complete, seasonDrafts, picks] = await Promise.all([
    prisma.draft.count(),
    prisma.draft.groupBy({ by: ["status"], _count: true }),
    prisma.draft.groupBy({ by: ["gameMode"], _count: true }),
    prisma.draft.count({ where: { status: "complete" } }),
    prisma.draft.count({ where: { divisionsEnabled: true } }),
    prisma.draftPick.count(),
  ]);
  console.log(
    JSON.stringify(
      {
        totalDrafts: total,
        completedDrafts: complete,
        divisionDrafts: seasonDrafts,
        totalPicks: picks,
        byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count])),
        byMode: Object.fromEntries(byMode.map((r) => [r.gameMode, r._count])),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
