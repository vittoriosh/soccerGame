import { prisma } from "@/lib/db";

type PlayerCatalog = {
  years: number[];
  leagues: string[];
};

let catalog: PlayerCatalog | null = null;
let catalogPromise: Promise<PlayerCatalog> | null = null;

/**
 * Years and leagues change only when the player CSV is re-seeded.
 * Cache them for the process so setup pages don't DISTINCT-scan 180k rows.
 */
export async function getPlayerCatalog(): Promise<PlayerCatalog> {
  if (catalog) return catalog;
  if (!catalogPromise) {
    catalogPromise = (async () => {
      const [yearRows, leagueRows] = await Promise.all([
        prisma.$queryRaw<{ year: number }[]>`
          SELECT DISTINCT year FROM "Player" ORDER BY year DESC
        `,
        prisma.$queryRaw<{ league: string }[]>`
          SELECT DISTINCT league FROM "Player"
          WHERE league <> ''
          ORDER BY league ASC
        `,
      ]);
      const next = {
        years: yearRows.map((row) => row.year),
        leagues: leagueRows.map((row) => row.league),
      };
      catalog = next;
      return next;
    })().catch((error) => {
      catalogPromise = null;
      throw error;
    });
  }
  return catalogPromise;
}

export async function availablePlayerYears(): Promise<number[]> {
  return (await getPlayerCatalog()).years;
}

export async function availablePlayerLeagues(): Promise<string[]> {
  return (await getPlayerCatalog()).leagues;
}

export function clearPlayerCatalogCache() {
  catalog = null;
  catalogPromise = null;
}
