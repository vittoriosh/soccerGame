import { prisma } from "../src/lib/db";
async function main() {
  const [results, careers, div1, titles] = await Promise.all([
    prisma.careerResult.count(),
    prisma.careerResult.groupBy({ by: ["careerKey"], _count: true }),
    prisma.careerResult.count({ where: { division: 1 } }),
    prisma.careerResult.count({ where: { fieldRank: 1 } }),
  ]);
  console.log(JSON.stringify({ results, careers: careers.length, div1Seasons: div1, titles }, null, 2));
}
main().finally(() => prisma.$disconnect());
