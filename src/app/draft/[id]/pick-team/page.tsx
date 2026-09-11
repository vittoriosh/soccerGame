import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { StadiumShell } from "@/components/stadium-shell";
import { PickClubFlow } from "@/components/pick-club-flow";
import { availablePlayerYears } from "@/lib/create-draft";
import { divisionLeagueLabel } from "@/lib/season-divisions";
import { parseDraftYears } from "@/lib/draft";

export const dynamic = "force-dynamic";

export default async function PickTeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const draftId = Number.parseInt(id, 10);
  if (!draftId) notFound();

  const draft = await prisma.draft.findUnique({ where: { id: draftId } });
  if (!draft) notFound();

  if (draft.status === "in_progress" || draft.status === "complete") {
    redirect(`/draft/${draftId}`);
  }

  const teams = await prisma.team.findMany({
    where: { draftId },
    orderBy: [{ league: "asc" }, { shortName: "asc" }],
  });

  const clubs = teams.map((team) => ({
    id: team.id,
    name: team.name,
    shortName: team.shortName,
    league: team.league,
    // Every league fields its real clubs now, so the crest comes straight
    // off the club record instead of a Premier-League-only lookup.
    clubId: team.clubId,
  }));

  const chosenClub =
    (draft.status === "rolling_pick" || draft.status === "pick_revealed") && draft.userTeamId
      ? (clubs.find((c) => c.id === draft.userTeamId) ?? null)
      : null;
  const revealedPick =
    draft.status === "pick_revealed" && draft.userTeamId
      ? (teams.find((t) => t.id === draft.userTeamId)?.draftOrder ?? null)
      : null;

  // Career doesn't let you choose the pool — the division sets the leagues
  // and rolls the years — so the pool gets revealed here instead.
  const seasonPool =
    draft.gameMode === "career"
      ? {
          leagueLabel: divisionLeagueLabel(draft.division),
          years: parseDraftYears(draft.years),
          yearOptions: await availablePlayerYears(),
        }
      : null;

  return (
    <StadiumShell scrollable>
      <PickClubFlow
        draftId={draftId}
        clubs={clubs}
        chosenClub={chosenClub}
        revealedPick={revealedPick}
        teamCount={teams.length}
        seasonLabel={
          draft.divisionsEnabled
            ? `Season ${draft.seasonNumber} · Division ${draft.division}`
            : null
        }
        seasonPool={seasonPool}
      />
    </StadiumShell>
  );
}
