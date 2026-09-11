import { prisma } from "./db";
import { isCareerMode } from "./game-mode";
import { scoringRulesFromDraft } from "./scoring-rules";
import { evaluateSquad } from "./squad-evaluation";

/**
 * Saves one immutable public result per completed career season. Safe to
 * call from overlapping completion requests: draftId is unique and upserted.
 */
export async function recordCareerResult(draftId: number): Promise<void> {
  const draft = await prisma.draft.findUnique({
    where: { id: draftId },
    include: {
      userTeam: true,
      teams: { select: { id: true, formation: true } },
    },
  });
  if (
    !draft ||
    draft.status !== "complete" ||
    !isCareerMode(draft.gameMode) ||
    !draft.username ||
    !draft.careerKey ||
    !draft.userTeamId ||
    !draft.userTeam
  ) {
    return;
  }

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
    const teamPicks = picksByTeam.get(pick.teamId) ?? [];
    teamPicks.push(pick);
    picksByTeam.set(pick.teamId, teamPicks);
  }
  const coachByTeam = new Map(coachPicks.map((pick) => [pick.teamId, pick.coach.rating]));
  const rules = scoringRulesFromDraft(draft);
  const ranked = draft.teams
    .map((team) => ({
      teamId: team.id,
      score: evaluateSquad(
        team.formation,
        picksByTeam.get(team.id) ?? [],
        coachByTeam.get(team.id),
        rules,
      ).rating.rating,
    }))
    .sort((a, b) => b.score - a.score);

  const fieldRank = ranked.findIndex((team) => team.teamId === draft.userTeamId) + 1;
  const userScore = ranked.find((team) => team.teamId === draft.userTeamId)?.score;
  if (fieldRank < 1 || userScore == null) return;

  const data = {
    careerKey: draft.careerKey,
    username: draft.username,
    gameMode: draft.gameMode,
    division: draft.division,
    seasonNumber: draft.seasonNumber,
    teamName: draft.userTeam.shortName,
    teamScore: Math.round(userScore * 10) / 10,
    fieldRank,
    fieldSize: draft.teams.length,
  };

  await prisma.careerResult.upsert({
    where: { draftId },
    create: { draftId, ...data },
    update: data,
  });
}
