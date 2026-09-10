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
 * The `count` strongest real clubs in a league for the draft's chosen
 * years — strongest rather than a random sample so a small field is still
 * a field of clubs you recognise. Falls back to including thin squads only
 * if a league doesn't have enough full ones.
 */
export async function realClubsForLeague(
  league: string,
  years: number[],
  count: number,
): Promise<RealClub[]> {
  const rows = await prisma.player.groupBy({
    by: ["club", "clubId"],
    where: { league, year: { in: years }, club: { not: "" } },
    _avg: { overall: true },
    _max: { overall: true },
    _count: { _all: true },
  });

  const clubs = rows
    .map((row) => ({
      name: row.club,
      clubId: row.clubId,
      size: row._count._all,
      strength: squadStrength(row._avg.overall ?? 0, row._max.overall ?? 0),
    }))
    // A multi-year draft lists the same club once per year it appears in,
    // and sofifa sometimes spells the same club two ways ("Atlético" vs
    // "Atletico"). Collapse by real club id first, then by slug, keeping
    // the strongest version so we don't try to field the same side twice.
    .reduce((acc, club) => {
      const key =
        club.clubId != null ? `id:${club.clubId}` : `slug:${slugify(club.name)}`;
      const existing = acc.get(key);
      if (!existing || club.strength > existing.strength) acc.set(key, club);
      return acc;
    }, new Map<string, { name: string; clubId: number | null; size: number; strength: number }>());

  const ranked = Array.from(clubs.values()).sort((a, b) => b.strength - a.strength);
  const bySlug = new Map<string, (typeof ranked)[number]>();
  for (const club of ranked) {
    const slug = slugify(club.name);
    if (!bySlug.has(slug)) bySlug.set(slug, club);
  }
  const unique = Array.from(bySlug.values()).sort((a, b) => b.strength - a.strength);
  const full = unique.filter((c) => c.size >= MIN_SQUAD_SIZE);
  const pool = full.length >= count ? full : unique;

  const plShortNames = new Map(REAL_PL_TEAMS.map((t) => [t.name, t.shortName]));

  return pool.slice(0, Math.max(1, count)).map((club) => ({
    name: club.name,
    shortName: plShortNames.get(club.name) ?? deriveShortName(club.name),
    clubId: club.clubId,
    strength: club.strength,
  }));
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
): Promise<DraftableCoach[]> {
  if (league === PREMIER_LEAGUE) return realPremierLeagueCoachPool();

  const clubs = await realClubsForLeague(league, years, MAX_TEAMS_PER_LEAGUE);
  const names = generateCoachNames(clubs.length, excludeCoachNames);

  return clubs.map((club, i) => ({
    name: names[i] ?? `${club.shortName} Manager`,
    club: club.name,
    clubId: club.clubId,
    rating: coachRatingFor(club.strength),
  }));
}
