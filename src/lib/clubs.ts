import { prisma } from "@/lib/db";
import {
  MAX_TEAMS_PER_LEAGUE,
  PREMIER_LEAGUE,
  REAL_PL_TEAMS,
  generateCoachNames,
  realPremierLeagueCoachPool,
  slugify,
} from "@/lib/league-data";

/**
 * Every competing club in a draft is now a real club, in every league —
 * derived from the player data itself rather than hand-authored, since the
 * Player table already carries the real `club`, `clubId` (sofifa, so crests
 * work everywhere) and `league` for ~660 clubs. That replaces the old
 * "Dynamo Rovers"-style placeholder names outside the Premier League.
 */
export type RealClub = {
  name: string;
  shortName: string;
  clubId: number | null;
  /** Squad strength, on the same 1-99 scale as a player rating. */
  strength: number;
};

/** Below this, a "club" in the data is a fragment (youth side, mid-season
 *  transfer artefact) rather than a squad you could field. */
const MIN_SQUAD_SIZE = 14;

/** Club-type tokens that carry no identity — dropped from either end so a
 *  crowded team list reads "Barcelona", not "FC Barcelona". */
const AFFIXES = new Set([
  "fc", "cf", "afc", "ac", "sc", "ss", "ssc", "as", "rc", "rcd", "cd", "sd",
  "ud", "ca", "sv", "vfl", "vfb", "tsg", "fsv", "bsc", "us", "sl", "fk",
  "nk", "hnk", "gnk", "bk", "if", "ff", "aik", "cfc", "club", "de", "futbol",
  "1.", "1899", "04", "05", "96", "München", "calcio",
]);

function deriveShortName(name: string): string {
  const parts = name.split(" ");
  while (parts.length > 1 && AFFIXES.has(parts[0].toLowerCase())) parts.shift();
  while (parts.length > 1 && AFFIXES.has(parts[parts.length - 1].toLowerCase())) parts.pop();
  const short = parts.join(" ").trim();
  return short.length >= 3 ? short : name;
}

/** Squad average carries most of the weight — it's what actually decides
 *  how deep a club's real squad is — with a slice for the single best
 *  player, so a one-star club still reads as a club with a star. */
function squadStrength(avgOverall: number, maxOverall: number): number {
  return Math.round((avgOverall * 0.75 + maxOverall * 0.25) * 10) / 10;
}

/**
 * Every club a league can field for the chosen years, strongest first.
 * `full` is the real supply — clubs with a squad you could actually put on
 * a pitch — and `all` adds the thin ones, which only get used when a field
 * is bigger than the full supply.
 */
export type LeagueClubPool = { full: RealClub[]; all: RealClub[] };

type ClubYearRow = {
  club: string;
  clubId: number | null;
  year: number;
  _avg: { overall: number | null };
  _max: { overall: number | null };
  _count: { _all: number };
};

const clubRowCache = new Map<string, Promise<ClubYearRow[]>>();

function clubCacheKey(league: string, years: number[]) {
  return `${league}|${[...years].sort((a, b) => a - b).join(",")}`;
}

async function clubRowsForLeague(league: string, years: number[]): Promise<ClubYearRow[]> {
  const key = clubCacheKey(league, years);
  const cached = clubRowCache.get(key);
  if (cached) return cached;

  const pending = prisma.player.groupBy({
    by: ["club", "clubId", "year"],
    where: { league, year: { in: years }, club: { not: "" } },
    _avg: { overall: true },
    _max: { overall: true },
    _count: { _all: true },
  });
  clubRowCache.set(key, pending);
  try {
    return await pending;
  } catch (error) {
    clubRowCache.delete(key);
    throw error;
  }
}

function poolsFromRows(rows: ClubYearRow[]): LeagueClubPool {
  const clubs = rows
    .reduce(
      (acc, row) => {
        const key =
          row.clubId != null ? `id:${row.clubId}` : `slug:${slugify(row.club)}`;
        const size = row._count._all;
        const avg = row._avg.overall ?? 0;
        const max = row._max.overall ?? 0;
        const yearStrength = squadStrength(avg, max);
        const existing = acc.get(key);
        if (!existing) {
          acc.set(key, {
            name: row.club,
            clubId: row.clubId,
            size,
            weightedOverall: avg * size,
            maxOverall: max,
            bestYearStrength: yearStrength,
          });
          return acc;
        }
        existing.size += size;
        existing.weightedOverall += avg * size;
        existing.maxOverall = Math.max(existing.maxOverall, max);
        if (yearStrength > existing.bestYearStrength) {
          existing.name = row.club;
          existing.clubId = row.clubId;
          existing.bestYearStrength = yearStrength;
        }
        return acc;
      },
      new Map<
        string,
        {
          name: string;
          clubId: number | null;
          size: number;
          weightedOverall: number;
          maxOverall: number;
          bestYearStrength: number;
        }
      >(),
    );

  const ranked = Array.from(clubs.values())
    .map((club) => ({
      name: club.name,
      clubId: club.clubId,
      size: club.size,
      strength: squadStrength(
        club.size > 0 ? club.weightedOverall / club.size : 0,
        club.maxOverall,
      ),
    }))
    .sort((a, b) => b.strength - a.strength);
  const bySlug = new Map<string, (typeof ranked)[number]>();
  for (const club of ranked) {
    const slug = slugify(club.name);
    if (!bySlug.has(slug)) bySlug.set(slug, club);
  }
  const unique = Array.from(bySlug.values()).sort((a, b) => b.strength - a.strength);
  const plShortNames = new Map(REAL_PL_TEAMS.map((t) => [t.name, t.shortName]));
  const toClub = (club: (typeof unique)[number]): RealClub => ({
    name: club.name,
    shortName: plShortNames.get(club.name) ?? deriveShortName(club.name),
    clubId: club.clubId,
    strength: club.strength,
  });

  return {
    full: unique.filter((c) => c.size >= MIN_SQUAD_SIZE).map(toClub),
    all: unique.map(toClub),
  };
}

export async function clubPoolForLeague(
  league: string,
  years: number[],
): Promise<LeagueClubPool> {
  return poolsFromRows(await clubRowsForLeague(league, years));
}

/**
 * The `count` strongest real clubs in a league — strongest rather than a
 * random sample so a small field is still a field of clubs you recognise.
 * Falls back to including thin squads only if a league doesn't have enough
 * full ones.
 */
export async function realClubsForLeague(
  league: string,
  years: number[],
  count: number,
): Promise<RealClub[]> {
  const pool = await clubPoolForLeague(league, years);
  const source = pool.full.length >= count ? pool.full : pool.all;
  return source.slice(0, Math.max(1, count));
}

/** Squad strengths run ~51 (bottom of a minor league) to ~83 (Arsenal). */
const STRENGTH_FLOOR = 56;
const STRENGTH_CEIL = 82;
/** Generated managers top out below the real marquee names (Guardiola 93),
 *  so hiring an actual great coach stays a distinct prize. */
const COACH_RATING_FLOOR = 64;
const COACH_RATING_CEIL = 88;

function coachRatingFor(strength: number): number {
  const t = Math.max(0, Math.min(1, (strength - STRENGTH_FLOOR) / (STRENGTH_CEIL - STRENGTH_FLOOR)));
  const base = COACH_RATING_FLOOR + t * (COACH_RATING_CEIL - COACH_RATING_FLOOR);
  const jitter = Math.floor(Math.random() * 5) - 2;
  return Math.max(60, Math.min(COACH_RATING_CEIL, Math.round(base + jitter)));
}

export type DraftableCoach = {
  name: string;
  club: string;
  clubId: number | null;
  rating: number;
};

/**
 * A full-size coach pool for a league, independent of how many of its clubs
 * are actually competing (see `realPremierLeagueCoachPool`). The Premier
 * League uses its real managers; elsewhere we have no managerial dataset,
 * so a coach is a generated name attached to a real club, rated off that
 * club's real squad strength — which makes the coach market meaningful
 * (managing Bayern is a better job than managing Heidenheim) instead of
 * random.
 */
export async function coachPoolForLeague(
  league: string,
  years: number[],
  excludeCoachNames: Set<string>,
  count: number = MAX_TEAMS_PER_LEAGUE,
): Promise<DraftableCoach[]> {
  // The Premier League's real managers come first and always; a field big
  // enough to need more than twenty tops up with generated names, because
  // the last round forces every club to hire someone.
  const real = league === PREMIER_LEAGUE ? realPremierLeagueCoachPool() : [];
  if (real.length >= count) return real;

  // One manager per club per season, so a wider year window is a deeper
  // coach market the same way it's a deeper player pool. Seasons are
  // interleaved rather than concatenated so the strongest clubs from every
  // year reach the board, not all of one season before any of the next.
  const rows = await clubRowsForLeague(league, years);
  const seasons = years.map((year) => {
    const pool = poolsFromRows(rows.filter((row) => row.year === year));
    return pool.full.length > 0 ? pool.full : pool.all;
  });
  const realClubNames = new Set(real.map((coach) => coach.club));
  const hosts: RealClub[] = [];
  for (let rank = 0; rank < Math.max(0, ...seasons.map((s) => s.length)); rank++) {
    for (const season of seasons) {
      const club = season[rank];
      if (club && !realClubNames.has(club.name)) hosts.push(club);
    }
  }
  if (hosts.length === 0) return real;

  const taken = new Set([...excludeCoachNames, ...real.map((coach) => coach.name)]);
  const need = count - real.length;
  const names = generateCoachNames(need, taken);

  const generated = Array.from({ length: need }, (_, i) => {
    const club = hosts[i % hosts.length];
    return {
      name: names[i] ?? `${club.shortName} Manager ${i + 1}`,
      club: club.name,
      clubId: club.clubId,
      rating: coachRatingFor(club.strength),
    };
  });

  return [...real, ...generated];
}
