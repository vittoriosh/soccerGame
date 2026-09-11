"use server";

import { redirect } from "next/navigation";
import { MAX_TEAMS_PER_LEAGUE, distributeTeamsAcrossLeagues } from "@/lib/league-data";
import { defaultFormationForMode, getFormation } from "@/lib/formations";
import { formationModeFor, normalizeGameMode } from "@/lib/game-mode";
import { scoringRulesFromForm } from "@/lib/scoring-rules";
import {
  STARTING_DIVISION,
  divisionScope,
  rollDivisionYears,
} from "@/lib/season-divisions";
import { availablePlayerYears, createDraft } from "@/lib/create-draft";

export async function startDraft(formData: FormData) {
  const gameMode = normalizeGameMode(String(formData.get("gameMode") ?? ""));
  const career = gameMode === "career";

  // Locked for the rest of the draft — every pick is judged against these
  // roles, so it can't be changed once players are off the board.
  const requestedFormation = getFormation(
    String(formData.get("formation") ?? defaultFormationForMode(gameMode)),
  );
  const formation =
    requestedFormation.mode === formationModeFor(gameMode)
      ? requestedFormation.key
      : defaultFormationForMode(gameMode);
  const rules = scoringRulesFromForm(formData);

  const availableYears = await availablePlayerYears();
  if (availableYears.length === 0) throw new Error("No player years available");

  // Career skips the setup knobs entirely: the division decides the
  // leagues, the field size and which years get rolled into the pool.
  if (career) {
    const scope = divisionScope(STARTING_DIVISION);
    const draftId = await createDraft({
      leagues: scope.leagues,
      years: rollDivisionYears(STARTING_DIVISION, availableYears),
      totalTeams: scope.teamCount,
      formation,
      gameMode,
      rules,
      divisionsEnabled: true,
      division: STARTING_DIVISION,
      seasonNumber: 1,
    });
    redirect(`/draft/${draftId}/pick-team`);
  }

  const leagues = formData.getAll("leagues").map(String).filter(Boolean);
  if (leagues.length === 0) throw new Error("Pick at least one league");

  // Total field size across every picked league. Default 20 per league;
  // min 2; max 20 × league count (2 leagues → 40, 3 → 60, …).
  const rawTotalTeams = Number.parseInt(String(formData.get("totalTeams")), 10);
  const maxTotal = leagues.length * MAX_TEAMS_PER_LEAGUE;
  const totalTeams =
    Number.isFinite(rawTotalTeams) && rawTotalTeams > 0
      ? Math.max(2, Math.min(maxTotal, rawTotalTeams))
      : maxTotal;
  // Re-derived inside createDraft too; this keeps the cap check honest here.
  distributeTeamsAcrossLeagues(totalTeams, leagues.length);

  const yearSet = new Set(availableYears);
  const years = [
    ...new Set(
      formData
        .getAll("years")
        .map((v) => Number.parseInt(String(v), 10))
        .filter((y) => Number.isFinite(y) && yearSet.has(y)),
    ),
  ]
    .sort((a, b) => b - a)
    .slice(0, 3);
  if (years.length === 0) years.push(availableYears[0]);

  const divisionsEnabled =
    gameMode === "sevens" && String(formData.get("divisionsEnabled") ?? "0") === "1";

  const draftId = await createDraft({
    leagues,
    years,
    totalTeams,
    formation,
    gameMode,
    rules,
    divisionsEnabled,
    division: STARTING_DIVISION,
    seasonNumber: 1,
  });

  redirect(`/draft/${draftId}/pick-team`);
}
