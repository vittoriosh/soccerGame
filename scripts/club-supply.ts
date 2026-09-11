import { prisma } from "../src/lib/db";
import { TOP_5_LEAGUES } from "../src/lib/league-data";
import { divisionScope, MAX_DIVISION, MIN_DIVISION } from "../src/lib/season-divisions";

/**
 * A career division's field size is capped by how many real clubs its
 * leagues can actually field — and because the years are rolled at random,
 * the number that matters is the WORST combination it could be handed, not
 * the newest season. Reports that floor per division.
 */
const MIN_SQUAD_SIZE = 14;

function combinations<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (items.length < k) return [];
  const [head, ...rest] = items;
  return [
    ...combinations(rest, k - 1).map((combo) => [head, ...combo]),
    ...combinations(rest, k),
  ];
}

async function main() {
  const rows = await prisma.player.groupBy({
    by: ["league", "year", "clubId"],
    where: { league: { in: TOP_5_LEAGUES }, club: { not: "" } },
    _count: { _all: true },
  });

  // league -> year -> set of clubs with a fieldable squad
  const byLeagueYear = new Map<string, Map<number, Set<number>>>();
  const years = new Set<number>();
  for (const row of rows) {
    if (row.clubId == null || row._count._all < MIN_SQUAD_SIZE) continue;
    years.add(row.year);
    const perYear = byLeagueYear.get(row.league) ?? new Map<number, Set<number>>();
    const set = perYear.get(row.year) ?? new Set<number>();
    set.add(row.clubId);
    perYear.set(row.year, set);
    byLeagueYear.set(row.league, perYear);
  }
  const allYears = [...years].sort((a, b) => b - a);
  console.log("years:", allYears.join(","), "\n");

  function supply(leagues: string[], window: number[]): number {
    const clubs = new Set<number>();
    for (const league of leagues) {
      for (const year of window) {
        for (const id of byLeagueYear.get(league)?.get(year) ?? []) clubs.add(id);
      }
    }
    return clubs.size;
  }

  console.log("div  target  floor  median  spare  leagues");
  for (let division = MAX_DIVISION; division >= MIN_DIVISION; division--) {
    const scope = divisionScope(division);
    const windows = combinations(allYears, scope.yearCount);
    const sizes = windows.map((w) => supply(scope.leagues, w)).sort((a, b) => a - b);
    const floor = sizes[0];
    const median = sizes[Math.floor(sizes.length / 2)];
    const headroom = (floor - scope.teamCount) / scope.teamCount;
    const flag = floor < scope.teamCount ? "SHORT" : headroom < 0.2 ? "TIGHT" : "ok";
    console.log(
      `${String(division).padEnd(4)} ${String(scope.teamCount).padEnd(7)} ${String(floor).padEnd(6)} ${String(median).padEnd(7)} ${`${Math.round(headroom * 100)}%`.padEnd(6)} ${scope.leagues.length}L/${scope.yearCount}y ${flag}`,
    );
  }

  // Every club fields exactly one keeper and at most 3 DEF / 3 MID / 2 ATT,
  // so a group running dry mid-draft is what freezes a board.
  const MAX_SLOTS: Record<string, number> = { GK: 1, DEF: 3, MID: 3, FWD: 2 };
  const playerRows = await prisma.player.groupBy({
    by: ["league", "year", "positionGroup"],
    where: { league: { in: TOP_5_LEAGUES } },
    _count: { _all: true },
  });

  console.log("\nplayer supply at the worst year draw (need = clubs x max slots)");
  console.log("div  " + Object.keys(MAX_SLOTS).map((g) => g.padEnd(14)).join(""));
  for (let division = MAX_DIVISION; division >= MIN_DIVISION; division--) {
    const scope = divisionScope(division);
    const windows = combinations(allYears, scope.yearCount);
    const cells = Object.entries(MAX_SLOTS).map(([group, slots]) => {
      const need = scope.teamCount * slots;
      const have = Math.min(
        ...windows.map((window) =>
          playerRows
            .filter(
              (r) =>
                r.positionGroup === group &&
                scope.leagues.includes(r.league) &&
                window.includes(r.year),
            )
            .reduce((sum, r) => sum + r._count._all, 0),
        ),
      );
      return `${have}/${need}${have >= need ? "" : " SHORT"}`.padEnd(14);
    });
    console.log(`${String(division).padEnd(4)} ${cells.join("")}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
