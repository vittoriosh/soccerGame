/**
 * End-to-end draft simulation: creates a draft, lets the CPU fill every
 * team (including the "user" one), then reports the field so mechanics
 * changes can be sanity-checked without clicking through 320 picks.
 *
 *   npx tsx scripts/sim-draft.ts "Premier League,La Liga" 20 2026 4-3-3
 */
import { prisma } from "../src/lib/db";
import { advanceDraft, ROUNDS } from "../src/lib/draft";
import { coachPoolForLeague, realClubsForLeague } from "../src/lib/clubs";
import { assignSquadToFormation, getFormation, positionFit, FORMATIONS } from "../src/lib/formations";
import { computeSquadChemistry, applyCoachChemistryBoost, averageChemistry } from "../src/lib/chemistry";
import { computeSquadRating } from "../src/lib/team-rating";
import { distributeTeamsAcrossLeagues, shuffled, slugify } from "../src/lib/league-data";

async function main() {
  const leagues = (process.argv[2] ?? "Premier League").split(",");
  const totalTeams = Number.parseInt(process.argv[3] ?? "20", 10);
  const years = (process.argv[4] ?? "2026").split(",").map(Number);
  const formationKey = process.argv[5] ?? "4-3-3";

  const perLeague = distributeTeamsAcrossLeagues(totalTeams, leagues.length);
  const draft = await prisma.draft.create({
    data: {
      leagues: leagues.join(","),
      years: years.join(","),
      formation: formationKey,
      status: "in_progress",
      currentPick: 1,
    },
  });

  let order = 1;
  const usedCoachNames = new Set<string>();
  for (let i = 0; i < leagues.length; i++) {
    const clubs = await realClubsForLeague(leagues[i], years, perLeague[i]);
    await prisma.team.createMany({
      data: clubs.map((club) => ({
        draftId: draft.id,
        league: leagues[i],
        name: club.name,
        shortName: club.shortName,
        slug: `${slugify(leagues[i])}-${slugify(club.name)}`,
        clubId: club.clubId,
        draftOrder: order++,
        formation: shuffled(FORMATIONS)[0].key,
      })),
    });
    const coaches = await coachPoolForLeague(leagues[i], years, usedCoachNames);
    for (const c of coaches) usedCoachNames.add(c.name);
    await prisma.coach.createMany({
      data: coaches.map((c) => ({
        draftId: draft.id,
        name: c.name,
        club: c.club,
        clubId: c.clubId,
        rating: c.rating,
      })),
    });
  }

  // KEEP=1 leaves a real, playable draft behind with a user team on the
  // clock — for poking at the actual draft board instead of only the
  // numbers.
  if (process.env.KEEP === "1") {
    const mine = await prisma.team.findFirstOrThrow({ where: { draftId: draft.id } });
    await prisma.team.update({ where: { id: mine.id }, data: { formation: formationKey } });
    await prisma.draft.update({ where: { id: draft.id }, data: { userTeamId: mine.id } });
  }

  const started = Date.now();
  await advanceDraft(draft.id);
  const elapsed = Date.now() - started;

  if (process.env.KEEP === "1") {
    const kept = await prisma.draft.findUniqueOrThrow({
      where: { id: draft.id },
      include: { userTeam: true },
    });
    console.log(
      `kept draft ${kept.id} — you are ${kept.userTeam?.shortName} (${kept.userTeam?.formation}), on the clock at pick ${kept.currentPick}`,
    );
    return;
  }

  const teams = await prisma.team.findMany({ where: { draftId: draft.id } });
  const picks = await prisma.draftPick.findMany({
    where: { draftId: draft.id },
    include: { player: true },
  });
  const coachPicks = await prisma.coachPick.findMany({
    where: { draftId: draft.id },
    include: { coach: true },
  });
  const state = await prisma.draft.findUniqueOrThrow({ where: { id: draft.id } });

  console.log(
    `draft ${draft.id}: ${state.status} at pick ${state.currentPick}/${teams.length * ROUNDS} in ${elapsed}ms`,
  );
  console.log(`picks: ${picks.length} players + ${coachPicks.length} coaches`);

  const byTeam = new Map<number, typeof picks>();
  for (const p of picks) {
    if (!byTeam.has(p.teamId)) byTeam.set(p.teamId, []);
    byTeam.get(p.teamId)!.push(p);
  }
  const coachByTeam = new Map(coachPicks.map((c) => [c.teamId, c.coach]));

  const rows = teams.map((team) => {
    const teamPicks = (byTeam.get(team.id) ?? []).sort((a, b) => a.pickNumber - b.pickNumber);
    const formation = getFormation(team.formation);
    const { starters, bench } = assignSquadToFormation(
      teamPicks.map((p) => ({ player: p.player, slotId: p.slotId })),
      formation,
    );
    const slotByPlayer = new Map<number, string>();
    for (const [slotId, player] of starters) slotByPlayer.set(player.id, slotId);
    const coach = coachByTeam.get(team.id);
    const chem = applyCoachChemistryBoost(
      computeSquadChemistry(
        [...starters.values(), ...bench].map((p) => ({
          id: p.id,
          club: p.club,
          league: p.league,
          nationality: p.nationality,
          positions: p.positions,
          slotId: slotByPlayer.get(p.id) ?? null,
        })),
        formation,
      ),
      coach?.rating,
    );
    const rating = computeSquadRating({ formation, starters, bench, chemistry: chem, coachRating: coach?.rating });
    const exact = formation.slots.filter((s) => {
      const p = starters.get(s.id);
      return p && positionFit(p.positions, s.code) === "exact";
    }).length;
    const misplaced = formation.slots.filter((s) => {
      const p = starters.get(s.id);
      if (!p) return false;
      const fit = positionFit(p.positions, s.code);
      return fit === "outOfPosition" || fit === "emergency";
    }).length;
    return {
      team: team.shortName,
      shape: team.formation,
      picks: teamPicks.length,
      xi: starters.size,
      bench: bench.length,
      exact,
      misplaced,
      chem: averageChemistry(chem),
      coach: coach ? `${coach.name.split(" ").pop()} ${coach.rating}` : "—",
      coachRound: coachPicks.find((c) => c.teamId === team.id)
        ? Math.ceil(coachPicks.find((c) => c.teamId === team.id)!.pickNumber / teams.length)
        : 0,
      rating: rating.rating,
      fitCost: rating.fitCost,
    };
  });

  rows.sort((a, b) => b.rating - a.rating);
  console.table(rows);

  const ratings = rows.map((r) => r.rating);
  const coachRatings = rows.map((r) => Number(r.coach.split(" ").pop() ?? 0));
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const corr = (a: number[], b: number[]) => {
    const ma = mean(a);
    const mb = mean(b);
    const num = a.reduce((s, v, i) => s + (v - ma) * (b[i] - mb), 0);
    const den = Math.sqrt(
      a.reduce((s, v) => s + (v - ma) ** 2, 0) * b.reduce((s, v) => s + (v - mb) ** 2, 0),
    );
    return den === 0 ? 0 : num / den;
  };
  console.log(
    `spread ${Math.min(...ratings).toFixed(1)}–${Math.max(...ratings).toFixed(1)} (mean ${mean(ratings).toFixed(1)})`,
  );
  console.log(`coach-rating correlation with team rating: ${corr(coachRatings, ratings).toFixed(2)}`);
  console.log(`coach rounds: ${rows.map((r) => r.coachRound).sort((a, b) => a - b).join(",")}`);
  console.log(
    `exact-fit starters: mean ${mean(rows.map((r) => r.exact)).toFixed(1)}/11, misplaced mean ${mean(rows.map((r) => r.misplaced)).toFixed(2)}`,
  );

  await prisma.draftPick.deleteMany({ where: { draftId: draft.id } });
  await prisma.coachPick.deleteMany({ where: { draftId: draft.id } });
  await prisma.draft.update({ where: { id: draft.id }, data: { userTeamId: null } });
  await prisma.coach.deleteMany({ where: { draftId: draft.id } });
  await prisma.team.deleteMany({ where: { draftId: draft.id } });
  await prisma.draft.delete({ where: { id: draft.id } });
}

main().finally(() => prisma.$disconnect());
