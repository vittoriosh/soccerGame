/**
 * Seeds thousands of career seasons, including careers that climb to Div 1.
 *
 *   npx tsx --env-file=.env scripts/seed-leaderboard.ts 2000
 *   npx tsx --env-file=.env scripts/seed-leaderboard.ts 3000 --concurrency 8
 */
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/db";
import { Prisma } from "../src/generated/prisma/client";
import { createDraft, availablePlayerYears } from "../src/lib/create-draft";
import {
  divisionScope,
  rollDivisionYears,
  seasonBandSize,
  seasonOutcome,
  STARTING_DIVISION,
  MIN_DIVISION,
} from "../src/lib/season-divisions";
import { DEFAULT_SCORING_RULES } from "../src/lib/scoring-rules";
import {
  DEFAULT_SEVENS_FORMATION_KEY,
  formationsForMode,
} from "../src/lib/formations";
import { shuffled } from "../src/lib/league-data";
import { advanceDraft } from "../src/lib/draft";
import { recordCareerResult } from "../src/lib/career-leaderboard";
import { evaluateSquad } from "../src/lib/squad-evaluation";
import type { GameMode } from "../src/lib/game-mode";

const FIRST = [
  "Alex", "Riley", "Jordan", "Sam", "Casey", "Morgan", "Quinn", "Avery",
  "Blake", "Cameron", "Drew", "Emery", "Finley", "Harper", "Jamie", "Kai",
  "Logan", "Nico", "Parker", "Reese", "Sage", "Taylor", "Val", "Wes",
  "Zane", "Ari", "Bailey", "Charlie", "Dakota", "Ellis", "Felix", "Greta",
  "Hugo", "Iris", "Jules", "Nora", "Owen", "Piper", "Remy", "Skye",
];
const LAST = [
  "Rivera", "Nguyen", "Patel", "Brooks", "Okoye", "Chen", "Silva", "Khan",
  "Lopez", "Singh", "Park", "Costa", "Ibrahim", "Novak", "Walsh", "Diaz",
  "Kim", "Rossi", "Ali", "Hughes", "Sato", "Meyer", "Torres", "Anders",
  "Cruz", "Fox", "Grant", "Hayes", "Lane", "Moss", "Berg", "Cole",
  "Dean", "Ford", "Gray", "Hart", "Ives", "Kane", "Lang", "West",
];

type KeepClub = {
  league: string;
  name: string;
  shortName: string;
  clubId: number | null;
};

type TeamRow = {
  id: number;
  formation: string;
  league: string;
  name: string;
  shortName: string;
  clubId: number | null;
};

function randomName(): string {
  const first = FIRST[Math.floor(Math.random() * FIRST.length)];
  const last = LAST[Math.floor(Math.random() * LAST.length)];
  const suffix = Math.random() < 0.45 ? ` ${1 + Math.floor(Math.random() * 99)}` : "";
  return `${first} ${last}${suffix}`.slice(0, 24);
}

function pickLooseDivision(): number {
  // Prefer mid/small fields for bulk volume; still sprinkle higher ones.
  const bag = [10, 9, 8, 8, 7, 7, 7, 6, 6, 6, 5, 5, 5, 4, 4, 3, 2];
  return bag[Math.floor(Math.random() * bag.length)];
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function run() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`worker ${index} failed: ${message.slice(0, 160)}`);
        results[index] = { seasons: 0, titles: 0, reachedDiv1: false } as R;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => run()));
  return results;
}

async function rollPickOrder(draftId: number) {
  const teams = await prisma.team.findMany({
    where: { draftId },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  const orders = shuffled(teams.map((_, i) => i + 1));
  await prisma.$transaction(
    async (tx) => {
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
    },
    { maxWait: 20000, timeout: 30000 },
  );
}

async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      const message = error instanceof Error ? error.message : String(error);
      const retryable =
        message.includes("Unable to start a transaction") ||
        message.includes("Timed out fetching") ||
        message.includes("Can't reach database") ||
        message.includes("P1001") ||
        message.includes("P2028");
      if (!retryable || i === attempts - 1) throw error;
      const wait = 500 * 2 ** i + Math.floor(Math.random() * 400);
      console.warn(`retry ${label} (${i + 1}/${attempts}) after ${wait}ms — ${message.slice(0, 80)}`);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  throw last;
}

async function rankTeams(draftId: number, teams: TeamRow[]) {
  const [picks, coachPicks] = await Promise.all([
    prisma.draftPick.findMany({
      where: { draftId },
      select: {
        teamId: true,
        slotId: true,
        player: {
          select: {
            id: true,
            overall: true,
            potential: true,
            age: true,
            positions: true,
            club: true,
            league: true,
            nationality: true,
          },
        },
      },
    }),
    prisma.coachPick.findMany({
      where: { draftId },
      select: { teamId: true, coach: { select: { rating: true } } },
    }),
  ]);
  const picksByTeam = new Map<number, typeof picks>();
  for (const pick of picks) {
    const list = picksByTeam.get(pick.teamId) ?? [];
    list.push(pick);
    picksByTeam.set(pick.teamId, list);
  }
  const coachByTeam = new Map(coachPicks.map((p) => [p.teamId, p.coach.rating]));
  return teams
    .map((team) => ({
      team,
      score: evaluateSquad(
        team.formation,
        picksByTeam.get(team.id) ?? [],
        coachByTeam.get(team.id),
        DEFAULT_SCORING_RULES,
      ).rating.rating,
    }))
    .sort((a, b) => b.score - a.score);
}

async function finishSeason(args: {
  username: string;
  careerKey: string;
  gameMode: GameMode;
  division: number;
  seasonNumber: number;
  formation: string;
  previousSeasonDraftId?: number | null;
  keepClub?: KeepClub | null;
  /** When set, user is drawn from the top N ranked clubs (1 = champion). */
  forceTopBand?: number | null;
}): Promise<{
  draftId: number;
  rank: number;
  score: number;
  nextDivision: number;
  club: KeepClub;
}> {
  const scope = divisionScope(args.division);
  const years = rollDivisionYears(args.division, await availablePlayerYears());
  const draftId = await withRetry(`createDraft Div${args.division}`, () =>
    createDraft({
      leagues: scope.leagues,
      years,
      totalTeams: scope.teamCount,
      formation: args.formation,
      gameMode: args.gameMode,
      username: args.username,
      careerKey: args.careerKey,
      rules: DEFAULT_SCORING_RULES,
      divisionsEnabled: true,
      division: args.division,
      seasonNumber: args.seasonNumber,
      previousSeasonDraftId: args.previousSeasonDraftId ?? null,
      keepClub: args.keepClub ?? null,
    }),
  );

  await withRetry(`rollPickOrder ${draftId}`, () => rollPickOrder(draftId));
  await prisma.draft.update({
    where: { id: draftId },
    data: { status: "in_progress", currentPick: 1 },
  });
  await withRetry(`advanceDraft ${draftId}`, () => advanceDraft(draftId));

  const teams = await prisma.team.findMany({
    where: { draftId },
    select: {
      id: true,
      formation: true,
      league: true,
      name: true,
      shortName: true,
      clubId: true,
    },
  });
  const ranked = await rankTeams(draftId, teams);
  const band =
    args.forceTopBand != null
      ? Math.max(1, Math.min(ranked.length, args.forceTopBand))
      : ranked.length;
  const pick = ranked[Math.floor(Math.random() * band)];
  const userTeam = pick.team;
  const rank = ranked.findIndex((row) => row.team.id === userTeam.id) + 1;

  await prisma.draft.update({
    where: { id: draftId },
    data: { userTeamId: userTeam.id, status: "complete" },
  });
  await recordCareerResult(draftId);
  const outcome = seasonOutcome(rank, teams.length, args.division);

  return {
    draftId,
    rank,
    score: Math.round(pick.score * 10) / 10,
    nextDivision: outcome.nextDivision,
    club: {
      league: userTeam.league,
      name: userTeam.name,
      shortName: userTeam.shortName,
      clubId: userTeam.clubId,
    },
  };
}

async function playLooseCareer(index: number, total: number) {
  const gameMode: GameMode = "career";
  const username = randomName();
  const careerKey = randomUUID();
  const formations = formationsForMode(gameMode);
  const formation = shuffled(formations)[0]?.key ?? DEFAULT_SEVENS_FORMATION_KEY;
  const seasonsToPlay = Math.random() < 0.2 ? 1 + Math.floor(Math.random() * 2) : 1;
  let division = pickLooseDivision();
  let previousDraftId: number | null = null;
  let keepClub: KeepClub | null = null;
  let titles = 0;
  let seasons = 0;

  for (let season = 1; season <= seasonsToPlay; season++) {
    const result = await finishSeason({
      username,
      careerKey,
      gameMode,
      division,
      seasonNumber: season,
      formation,
      previousSeasonDraftId: previousDraftId,
      keepClub,
    });
    seasons++;
    if (result.rank === 1) titles++;
    previousDraftId = result.draftId;
    keepClub = result.club;
    division = result.nextDivision;
  }

  if ((index + 1) % 25 === 0 || index === 0) {
    console.log(`loose ${index + 1}/${total} — last ${username} (${gameMode})`);
  }
  return { seasons, titles, reachedDiv1: false };
}

/**
 * Starts at Division 5 and keeps drafting until Division 1 is finished.
 * The human is always placed in the promotion band so the climb succeeds.
 */
async function playClimbCareer(index: number, total: number) {
  const gameMode: GameMode = "career";
  const username = randomName();
  const careerKey = randomUUID();
  const formations = formationsForMode(gameMode);
  const formation = shuffled(formations)[0]?.key ?? DEFAULT_SEVENS_FORMATION_KEY;

  let division = STARTING_DIVISION;
  let seasonNumber = 1;
  let previousDraftId: number | null = null;
  let keepClub: KeepClub | null = null;
  let titles = 0;
  let seasons = 0;
  let reachedDiv1 = false;

  // Hard cap stops pathological loops if something about promotion breaks.
  while (seasonNumber <= 20) {
    const scope = divisionScope(division);
    const promoBand = seasonBandSize(scope.teamCount);
    // On Div 1 itself, land anywhere in the top half so we still get variety.
    const forceTopBand =
      division === MIN_DIVISION
        ? Math.max(1, Math.ceil(scope.teamCount * 0.5))
        : promoBand;

    const result = await finishSeason({
      username,
      careerKey,
      gameMode,
      division,
      seasonNumber,
      formation,
      previousSeasonDraftId: previousDraftId,
      keepClub,
      forceTopBand,
    });
    seasons++;
    if (result.rank === 1) titles++;
    if (division === MIN_DIVISION) {
      reachedDiv1 = true;
      break;
    }
    previousDraftId = result.draftId;
    keepClub = result.club;
    division = result.nextDivision;
    seasonNumber++;
  }

  if ((index + 1) % 10 === 0 || index === 0) {
    console.log(
      `climb ${index + 1}/${total} — ${username} ${reachedDiv1 ? "reached Div 1" : "STOPPED"} in ${seasons} seasons`,
    );
  }
  return { seasons, titles, reachedDiv1 };
}

async function main() {
  const args = process.argv.slice(2);
  const total = Math.max(1, Number.parseInt(args.find((a) => /^\d+$/.test(a)) ?? "2000", 10) || 2000);
  const concurrencyArg = args.find((a) => a.startsWith("--concurrency"));
  const concurrency = Math.max(
    1,
    Number.parseInt(
      concurrencyArg?.includes("=")
        ? concurrencyArg.split("=")[1]
        : args[args.indexOf("--concurrency") + 1] ?? "4",
      10,
    ) || 4,
  );
  // ~30% of careers are dedicated Div 1 climbs; the rest fill volume.
  const climbCount = Math.max(1, Math.round(total * 0.3));
  const looseCount = Math.max(0, total - climbCount);

  const years = await availablePlayerYears();
  if (years.length === 0) throw new Error("No player years in the database");

  console.log(
    `Seeding ${total} Career 7s careers (${climbCount} Div 1 climbs + ${looseCount} loose) at concurrency ${concurrency}…`,
  );
  const started = Date.now();

  const climbJobs = Array.from({ length: climbCount }, (_, i) => i);
  const looseJobs = Array.from({ length: looseCount }, (_, i) => i);

  const climbStats = await mapPool(climbJobs, concurrency, (i) =>
    playClimbCareer(i, climbCount),
  );
  const looseStats = await mapPool(looseJobs, concurrency, (i) =>
    playLooseCareer(i, looseCount),
  );

  const seasons =
    climbStats.reduce((s, r) => s + r.seasons, 0) +
    looseStats.reduce((s, r) => s + r.seasons, 0);
  const titles =
    climbStats.reduce((s, r) => s + r.titles, 0) +
    looseStats.reduce((s, r) => s + r.titles, 0);
  const reached = climbStats.filter((r) => r.reachedDiv1).length;

  const [results, careers, div1Results] = await Promise.all([
    prisma.careerResult.count(),
    prisma.careerResult.findMany({ distinct: ["careerKey"], select: { careerKey: true } }),
    prisma.careerResult.count({ where: { division: 1 } }),
  ]);

  console.log(
    `Done in ${((Date.now() - started) / 1000 / 60).toFixed(1)}m — this run: ${seasons} seasons, ${titles} titles, ${reached}/${climbCount} Div 1 climbs`,
  );
  console.log(
    `Database now: ${results} season results · ${careers.length} careers · ${div1Results} Div 1 season rows`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
