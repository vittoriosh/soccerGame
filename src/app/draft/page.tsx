import { prisma } from "@/lib/db";
import {
  PREMIER_LEAGUE,
  TOP_5_LEAGUES,
  MAX_TEAMS_PER_LEAGUE,
} from "@/lib/league-data";
import { StadiumShell } from "@/components/stadium-shell";
import { DraftSetupWizard } from "@/components/draft-setup-wizard";

export const dynamic = "force-dynamic";

export default async function LeaguePickerPage() {
  const [distinctLeagues, distinctYears] = await Promise.all([
    prisma.player.findMany({
      distinct: ["league"],
      select: { league: true },
      orderBy: { league: "asc" },
    }),
    prisma.player.findMany({
      distinct: ["year"],
      select: { year: true },
      orderBy: { year: "desc" },
    }),
  ]);
  const leagues = distinctLeagues
    .map((l) => l.league)
    .filter(Boolean)
    .sort((a, b) => {
      if (a === PREMIER_LEAGUE) return -1;
      if (b === PREMIER_LEAGUE) return 1;
      return a.localeCompare(b);
    });
  const topLeagues = TOP_5_LEAGUES.filter((l) => leagues.includes(l));
  const otherLeagues = leagues.filter((l) => !topLeagues.includes(l));
  const availableYears = distinctYears.map((y) => y.year);

  return (
    <StadiumShell align="center">
      <DraftSetupWizard
        topLeagues={topLeagues}
        otherLeagues={otherLeagues}
        availableYears={availableYears}
        teamsPerLeagueDefault={MAX_TEAMS_PER_LEAGUE}
        maxTeamsPerLeague={MAX_TEAMS_PER_LEAGUE}
      />
    </StadiumShell>
  );
}
