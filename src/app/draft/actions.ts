"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  MAX_TEAMS_PER_LEAGUE,
  distributeTeamsAcrossLeagues,
  shuffled,
  slugify,
} from "@/lib/league-data";
import { coachPoolForLeague, realClubsForLeague } from "@/lib/clubs";
import { FORMATIONS, DEFAULT_FORMATION_KEY, getFormation } from "@/lib/formations";
import { scoringRulesFromForm } from "@/lib/scoring-rules";

export async function startDraft(formData: FormData) {
  const leagues = formData.getAll("leagues").map(String).filter(Boolean);
  if (leagues.length === 0) throw new Error("Pick at least one league");

  // Total field size across every picked league. Default 20; min 2; max
  // 20 × league count (2 leagues → 40, 3 → 60, …).
  const rawTotalTeams = Number.parseInt(String(formData.get("totalTeams")), 10);
  const minTotal = 2;
  const maxTotal = leagues.length * MAX_TEAMS_PER_LEAGUE;
  const totalTeams =
    Number.isFinite(rawTotalTeams) && rawTotalTeams > 0
      ? Math.max(minTotal, Math.min(maxTotal, rawTotalTeams))
      : Math.min(20, maxTotal);
  const teamsPerLeague = distributeTeamsAcrossLeagues(totalTeams, leagues.length);

  const availableYearRows = await prisma.player.findMany({
    distinct: ["year"],
    select: { year: true },
    orderBy: { year: "desc" },
  });
  const availableYears = new Set(availableYearRows.map((r) => r.year));
  const years = [
    ...new Set(
      formData
        .getAll("years")
        .map((v) => Number.parseInt(String(v), 10))
        .filter((y) => Number.isFinite(y) && availableYears.has(y)),
    ),
  ]
    .sort((a, b) => b - a)
    .slice(0, 3);
  if (years.length === 0) {
    const fallback = availableYearRows[0]?.year;
    if (!fallback) throw new Error("No player years available");
    years.push(fallback);
  }

  // Locked for the rest of the draft — every pick is judged against these
  // eleven roles, so it can't be changed once players are off the board.
  const formation = getFormation(String(formData.get("formation") ?? DEFAULT_FORMATION_KEY)).key;
  const rules = scoringRulesFromForm(formData);

  // Clubs and coaches are read outside the transaction: they're pure reads
  // against the shared Player table, and holding a SQLite write transaction
  // open across a dozen groupBy queries is what makes long setups time out.
  const usedCoachNames = new Set<string>();
  const leagueRosters: {
    league: string;
    clubs: Awaited<ReturnType<typeof realClubsForLeague>>;
    coaches: Awaited<ReturnType<typeof coachPoolForLeague>>;
  }[] = [];

  for (let i = 0; i < leagues.length; i++) {
    const league = leagues[i];
    const clubs = await realClubsForLeague(league, years, teamsPerLeague[i]);
    const coaches = rules.coach
      ? await coachPoolForLeague(league, years, usedCoachNames)
      : [];
    for (const c of coaches) usedCoachNames.add(c.name);
    leagueRosters.push({ league, clubs, coaches });
  }

  // One transaction: a mid-setup failure must not leave a "zombie" draft
  // behind with some league's teams created but its coaches missing.
  const draftId = await prisma.$transaction(async (tx) => {
    const draft = await tx.draft.create({
      data: {
        leagues: leagues.join(","),
        years: years.join(","),
        formation,
        cardPacksEnabled: false,
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

    for (const roster of leagueRosters) {
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
            // CPU teams each chase their own shape, so the field isn't 19
            // clones competing for the identical eleven roles.
            formation: shuffled(FORMATIONS)[0].key,
          };
        }),
      });

      // Coach is uniquely constrained on (draftId, name); a real manager can
      // legitimately appear in two of the picked leagues' pools.
      const coaches = roster.coaches.filter((c) => !seenCoachNames.has(c.name));
      for (const c of coaches) seenCoachNames.add(c.name);
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
  });

  redirect(`/draft/${draftId}/pick-team`);
}
