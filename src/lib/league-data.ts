export const PREMIER_LEAGUE = "Premier League";

/** The "Big 5" European top flights — the leagues most players actually
 *  recognize, offered as a one-click default instead of the full ~50-league
 *  list. */
export const TOP_5_LEAGUES = ["Premier League", "La Liga", "Bundesliga", "Serie A", "Ligue 1"];

// 2025-26 Premier League clubs and their real head coaches, index-aligned.
// Ratings are a judgment call based on real managerial reputation — see
// prior notes; there's no canonical dataset for this, unlike player
// ratings. clubId is the sofifa club_team_id (for crest images).
export const REAL_PL_TEAMS: { name: string; shortName: string }[] = [
  { name: "Arsenal", shortName: "Arsenal" },
  { name: "Aston Villa", shortName: "Aston Villa" },
  { name: "AFC Bournemouth", shortName: "Bournemouth" },
  { name: "Brentford", shortName: "Brentford" },
  { name: "Brighton & Hove Albion", shortName: "Brighton" },
  { name: "Burnley", shortName: "Burnley" },
  { name: "Chelsea", shortName: "Chelsea" },
  { name: "Crystal Palace", shortName: "Crystal Palace" },
  { name: "Everton", shortName: "Everton" },
  { name: "Fulham", shortName: "Fulham" },
  { name: "Leeds United", shortName: "Leeds" },
  { name: "Liverpool", shortName: "Liverpool" },
  { name: "Manchester City", shortName: "Man City" },
  { name: "Manchester United", shortName: "Man Utd" },
  { name: "Newcastle United", shortName: "Newcastle" },
  { name: "Nottingham Forest", shortName: "Nott'm Forest" },
  { name: "Sunderland", shortName: "Sunderland" },
  { name: "Tottenham Hotspur", shortName: "Spurs" },
  { name: "West Ham United", shortName: "West Ham" },
  { name: "Wolverhampton Wanderers", shortName: "Wolves" },
];

export const REAL_PL_COACHES: { name: string; clubId: number; rating: number }[] = [
  { name: "Mikel Arteta", clubId: 1, rating: 86 },
  { name: "Unai Emery", clubId: 2, rating: 85 },
  { name: "Andoni Iraola", clubId: 1943, rating: 80 },
  { name: "Keith Andrews", clubId: 1925, rating: 70 },
  { name: "Fabian Hürzeler", clubId: 1808, rating: 78 },
  { name: "Scott Parker", clubId: 1796, rating: 72 },
  { name: "Enzo Maresca", clubId: 5, rating: 79 },
  { name: "Oliver Glasner", clubId: 1799, rating: 83 },
  { name: "David Moyes", clubId: 7, rating: 80 },
  { name: "Marco Silva", clubId: 144, rating: 78 },
  { name: "Daniel Farke", clubId: 8, rating: 76 },
  { name: "Arne Slot", clubId: 9, rating: 90 },
  { name: "Pep Guardiola", clubId: 10, rating: 93 },
  { name: "Ruben Amorim", clubId: 11, rating: 74 },
  { name: "Eddie Howe", clubId: 13, rating: 84 },
  { name: "Nuno Espírito Santo", clubId: 14, rating: 78 },
  { name: "Régis Le Bris", clubId: 106, rating: 70 },
  { name: "Thomas Frank", clubId: 18, rating: 81 },
  { name: "Graham Potter", clubId: 19, rating: 75 },
  { name: "Vítor Pereira", clubId: 110, rating: 72 },
];

export function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const COACH_FIRST_NAMES = [
  "James",
  "Carlos",
  "Marco",
  "Luca",
  "Erik",
  "Thomas",
  "Andre",
  "Felix",
  "Diego",
  "Hugo",
  "Viktor",
  "Owen",
  "Mateo",
  "Lucas",
  "Noah",
  "Liam",
  "Kai",
  "Theo",
  "Ivan",
  "Mikael",
];
const COACH_LAST_NAMES = [
  "Ward",
  "Novak",
  "Rossi",
  "Keller",
  "Santos",
  "Berg",
  "Moreau",
  "Costa",
  "Hoffmann",
  "Reyes",
  "Larsen",
  "Fischer",
  "Andrade",
  "Voss",
  "Petrov",
  "Dahl",
  "Marchetti",
  "Roux",
  "Steiner",
  "Vidal",
];

export function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export const MAX_TEAMS_PER_LEAGUE = 20;

/**
 * Splits a user-chosen TOTAL team count evenly across however many leagues
 * they picked (remainder going to the first few leagues), each capped at
 * MAX_TEAMS_PER_LEAGUE. The number the user types is the size of the field
 * they'll actually be competing in, not a per-league multiplier — picking
 * 2 leagues and typing 5 means 5 teams total, not 10.
 */
export function distributeTeamsAcrossLeagues(totalTeams: number, leagueCount: number): number[] {
  const base = Math.floor(totalTeams / leagueCount);
  const remainder = totalTeams % leagueCount;
  return Array.from({ length: leagueCount }, (_, i) =>
    Math.min(MAX_TEAMS_PER_LEAGUE, base + (i < remainder ? 1 : 0)),
  );
}

/**
 * All 20 real coaches, every time — independent of how many Premier League
 * clubs are actually competing this draft. A coach's `club` here is just
 * their real-world affiliation for flavor/crest purposes; it doesn't need
 * to be one of this draft's competing teams, since coaches are hired by
 * WHATEVER team drafts them, not tied to their real club. This is what
 * keeps marquee names like Guardiola always draftable even in a small
 * draft, without forcing every team-count choice to also be a coach-count
 * choice.
 */
export function realPremierLeagueCoachPool(): { name: string; club: string; clubId: number; rating: number }[] {
  return REAL_PL_COACHES.map((coach, i) => ({ ...coach, club: REAL_PL_TEAMS[i].name }));
}

/** Invented manager names for leagues we have no managerial data for; their
 *  ratings come from the real club they manage instead (see clubs.ts).
 *  `excludeNames` matters because `Coach` is uniquely constrained on
 *  (draftId, name), so a collision between two leagues in the same
 *  multi-league draft would crash the insert. */
export function generateCoachNames(
  count: number,
  excludeNames: Set<string> = new Set(),
): string[] {
  const names = shuffled(COACH_FIRST_NAMES.flatMap((f) => COACH_LAST_NAMES.map((l) => `${f} ${l}`)));
  return names.filter((name) => !excludeNames.has(name)).slice(0, count);
}
