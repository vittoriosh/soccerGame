import { prisma } from "@/lib/db";
import { clubPoolForLeague, coachPoolForLeague, type RealClub } from "@/lib/clubs";
import { shuffled, slugify } from "@/lib/league-data";
import { formationsForMode } from "@/lib/formations";
import type { GameMode } from "@/lib/game-mode";
import type { ScoringRules } from "@/lib/scoring-rules";

/** A club the new field must contain — the club a career manager keeps
 *  across promotion and relegation, even when its league drops out of the
 *  division's scope. */
export type KeptClub = {
  league: string;
  name: string;
  shortName: string;
  clubId: number | null;
};

export type CreateDraftArgs = {
  leagues: string[];
  years: number[];
  totalTeams: number;
  formation: string;
  gameMode: GameMode;
  rules: ScoringRules;
  divisionsEnabled: boolean;
  division: number;
  seasonNumber: number;
  username?: string | null;
  careerKey?: string | null;
  previousSeasonDraftId?: number | null;
  cardPacksEnabled?: boolean;
  keepClub?: KeptClub | null;
};

type Roster = {
  league: string;
  clubs: RealClub[];
  coaches: Awaited<ReturnType<typeof coachPoolForLeague>>;
};

function clubKey(club: { clubId: number | null; name: string }): string {
  return club.clubId != null ? `id:${club.clubId}` : `slug:${slugify(club.name)}`;
}

/**
 * Splits a field across its leagues one club at a time, skipping any league
 * that has run out of real clubs. A flat share doesn't work once a career
 * division wants 100 clubs from five leagues of unequal size — Ligue 1 can
 * only ever field eighteen, and that shortfall has to land somewhere.
 * Returns per-league counts that add up to the field, or to the total real
 * supply when the leagues simply can't fill it.
 */
function allocateAcrossLeagues(totalTeams: number, supply: number[]): number[] {
  const alloc = supply.map(() => 0);
  const capacity = supply.reduce((sum, n) => sum + n, 0);
  let remaining = Math.min(Math.max(1, totalTeams), capacity);

  while (remaining > 0) {
    let placed = 0;
    for (let i = 0; i < supply.length && remaining > 0; i++) {
      if (alloc[i] >= supply[i]) continue;
      alloc[i]++;
      remaining--;
      placed++;
    }
    if (placed === 0) break;
  }

  return alloc;
}

/**
 * Builds a whole draft: its real clubs, its coach market, and the draft row
 * itself. Reads run outside the transaction — they're pure lookups against
 * the shared Player table, and holding a write transaction open across a
 * dozen groupBy queries is what makes long setups time out.
 */
export async function createDraft(args: CreateDraftArgs): Promise<number> {
  const { leagues, years, rules, gameMode } = args;
  if (leagues.length === 0) throw new Error("A draft needs at least one league");
  if (years.length === 0) throw new Error("A draft needs at least one player year");

  const pools = await Promise.all(
    leagues.map((league) => clubPoolForLeague(league, years)),
  );
  // Thin squads (youth sides, mid-season transfer artefacts) only join the
  // field when the real clubs can't fill it on their own.
  const fullSupply = pools.reduce((sum, pool) => sum + pool.full.length, 0);
  const sources = pools.map((pool) =>
    fullSupply >= args.totalTeams ? pool.full : pool.all,
  );
  const teamsPerLeague = allocateAcrossLeagues(
    args.totalTeams,
    sources.map((clubs) => clubs.length),
  );
  const fieldSize = teamsPerLeague.reduce((sum, n) => sum + n, 0);

  const usedCoachNames = new Set<string>();
  const rosters: Roster[] = [];

  for (let i = 0; i < leagues.length; i++) {
    const coaches = rules.coach
      ? await coachPoolForLeague(
          leagues[i],
          years,
          usedCoachNames,
          // Every club hires in the final round, so the market has to be at
          // least as deep as the field, with room for the names taken
          // before your turn comes around.
          Math.ceil(fieldSize / leagues.length) + 4,
        )
      : [];
    for (const coach of coaches) usedCoachNames.add(coach.name);
    rosters.push({
      league: leagues[i],
      clubs: sources[i].slice(0, teamsPerLeague[i]),
      coaches,
    });
  }

  // A promoted or relegated manager keeps their club even when the new
  // division no longer fields their league — the weakest side makes room.
  if (args.keepClub) {
    const kept = args.keepClub;
    const alreadyIn = rosters.some((roster) =>
      roster.clubs.some((club) => clubKey(club) === clubKey(kept)),
    );
    if (!alreadyIn) {
      const home = rosters.find((roster) => roster.league === kept.league);
      const entry: RealClub = {
        name: kept.name,
        shortName: kept.shortName,
        clubId: kept.clubId,
        strength: 0,
      };
      if (home) {
        home.clubs = [...home.clubs.slice(0, Math.max(0, home.clubs.length - 1)), entry];
      } else {
        rosters.push({ league: kept.league, clubs: [entry], coaches: [] });
        const biggest = rosters.reduce((a, b) => (a.clubs.length >= b.clubs.length ? a : b));
        if (biggest.clubs.length > 1) biggest.clubs = biggest.clubs.slice(0, -1);
      }
    }
  }

  // Fail here rather than in the last round: a field with fewer coaches
  // than clubs can't finish, because the final pick is a forced hire.
  if (rules.coach) {
    const coachCount = new Set(rosters.flatMap((r) => r.coaches.map((c) => c.name))).size;
    if (coachCount < fieldSize) {
      throw new Error(
        `Only ${coachCount} coaches available for a ${fieldSize}-club field`,
      );
    }
  }

  const modeFormations = formationsForMode(gameMode);

  return prisma.$transaction(
    async (tx) => {
      const draft = await tx.draft.create({
        data: {
          leagues: leagues.join(","),
          years: years.join(","),
          formation: args.formation,
          gameMode,
          username: args.username ?? null,
          careerKey: args.careerKey ?? null,
          divisionsEnabled: args.divisionsEnabled,
          division: args.division,
          seasonNumber: args.seasonNumber,
          previousSeasonDraftId: args.previousSeasonDraftId ?? null,
          cardPacksEnabled: args.cardPacksEnabled ?? false,
          chemistryEnabled: rules.chemistry,
          coachEnabled: rules.coach,
          ageEnabled: rules.age,
          potentialEnabled: rules.potential,
          fitEnabled: rules.fit,
        },
      });

      let draftOrder = 1;
      const seenCoachNames = new Set<string>();
      const seenSlugs = new Set<string>();

      for (const roster of rosters) {
        await tx.team.createMany({
          data: roster.clubs.map((club) => {
            const base = `${slugify(roster.league)}-${slugify(club.name)}` || "club";
            let slug = club.clubId != null && seenSlugs.has(base) ? `${base}-${club.clubId}` : base;
            if (seenSlugs.has(slug)) {
              let n = 2;
              while (seenSlugs.has(`${base}-${n}`)) n++;
              slug = `${base}-${n}`;
            }
            seenSlugs.add(slug);
            return {
              draftId: draft.id,
              league: roster.league,
              name: club.name,
              shortName: club.shortName,
              slug,
              clubId: club.clubId,
              draftOrder: draftOrder++,
              // CPU teams each chase their own shape, so the field isn't a
              // set of clones competing for the identical roles.
              formation: shuffled(modeFormations)[0].key,
            };
          }),
        });

        // Coach is uniquely constrained on (draftId, name); a real manager
        // can legitimately appear in two of the picked leagues' pools.
        const coaches = roster.coaches.filter((c) => !seenCoachNames.has(c.name));
        for (const coach of coaches) seenCoachNames.add(coach.name);
        await tx.coach.createMany({
          data: coaches.map((coach) => ({
            draftId: draft.id,
            name: coach.name,
            club: coach.club,
            clubId: coach.clubId,
            rating: coach.rating,
          })),
        });
      }

      return draft.id;
    },
    { timeout: 20000 },
  );
}

export async function availablePlayerYears(): Promise<number[]> {
  const rows = await prisma.player.findMany({
    distinct: ["year"],
    select: { year: true },
    orderBy: { year: "desc" },
  });
  return rows.map((row) => row.year);
}
