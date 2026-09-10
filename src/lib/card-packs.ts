import { prisma } from "@/lib/db";
import { getDraftedPlayerIds, excludeDrafted, parseDraftYears } from "@/lib/draft";
import { shuffled } from "@/lib/league-data";

const PACK_SIZE = 5;
/** Total trade-ins allowed for a team across the whole draft — not
 *  per-round. This is a one-time, post-draft-completion option. */
const MAX_TRADE_INS = 3;

export { MAX_TRADE_INS };

/** All not-yet-opened packs a team has for a draft (a pack created and left
 *  unresolved stays open until the player picks from it). */
export async function getUnresolvedPacks(draftId: number, teamId: number) {
  return prisma.cardPack.findMany({
    where: { draftId, teamId, chosenPlayerId: null },
    orderBy: { id: "asc" },
  });
}

/** How many trade-ins (opened or not) this team has already used, out of
 *  the MAX_TRADE_INS lifetime cap for this draft. */
export async function getTradeInsUsed(draftId: number, teamId: number) {
  return prisma.cardPack.count({ where: { draftId, teamId } });
}

/**
 * Trades in already-drafted players for packs — capped at MAX_TRADE_INS
 * total across the whole draft, not per call (so this also rejects a call
 * that would push a team over the cap when combined with packs it already
 * used in an earlier visit to this page). Each pack gets PACK_SIZE random
 * same-position candidates, drawn from the draft's selected leagues,
 * excluding every player already drafted by any team in this draft (which
 * also covers "not already on this team" — the team's own roster is a
 * subset of that).
 */
export async function tradeInPlayersForPacks(
  draftId: number,
  teamId: number,
  round: number,
  tradedPlayerIds: number[],
) {
  if (tradedPlayerIds.length === 0) return;

  const alreadyUsed = await getTradeInsUsed(draftId, teamId);
  if (alreadyUsed + tradedPlayerIds.length > MAX_TRADE_INS) {
    const remaining = Math.max(0, MAX_TRADE_INS - alreadyUsed);
    throw new Error(
      remaining === 0
        ? "You've already used all your trade-ins for this draft"
        : `You can only trade in ${remaining} more player${remaining === 1 ? "" : "s"}`,
    );
  }

  const draft = await prisma.draft.findUniqueOrThrow({ where: { id: draftId } });
  const leagues = draft.leagues.split(",");
  const years = parseDraftYears(draft.years);

  const myPicks = await prisma.draftPick.findMany({
    where: { draftId, teamId, playerId: { in: tradedPlayerIds } },
    include: { player: { select: { id: true, positionGroup: true } } },
  });
  if (myPicks.length !== tradedPlayerIds.length) {
    throw new Error("One of those players isn't on your team");
  }

  for (const pick of myPicks) {
    const draftedIds = new Set(await getDraftedPlayerIds(draftId));
    const candidatePool = await excludeDrafted(
      (fetchTake) =>
        prisma.player.findMany({
          where: {
            positionGroup: pick.player.positionGroup,
            league: { in: leagues },
            year: { in: years },
          },
          orderBy: { overall: "desc" },
          take: fetchTake,
        }),
      draftedIds,
      // Shuffling happens next, so fetch enough of the top pool that a
      // random 5-slice out of it stays plausible (not literally the top 5
      // every time), while still comfortably clearing SQLite's parameter
      // limit — see excludeDrafted's own comment.
      50,
    );
    const candidates = shuffled(candidatePool).slice(0, PACK_SIZE);
    if (candidates.length === 0) {
      throw new Error("No eligible players left to fill that pack right now");
    }

    await prisma.cardPack.create({
      data: {
        draftId,
        teamId,
        round,
        tradedPlayerId: pick.player.id,
        candidateIds: candidates.map((c) => c.id).join(","),
      },
    });
  }
}

/** Resolves one pack: swaps the traded-away player out of the team's draft
 *  slot for the chosen candidate, keeping the same pick/round/team slot. */
export async function choosePackPlayer(packId: number, chosenPlayerId: number) {
  const pack = await prisma.cardPack.findUniqueOrThrow({ where: { id: packId } });
  if (pack.chosenPlayerId) throw new Error("This pack has already been opened");

  const candidateIds = pack.candidateIds.split(",").map(Number);
  if (!candidateIds.includes(chosenPlayerId)) {
    throw new Error("That player isn't one of this pack's options");
  }

  const alreadyDrafted = await prisma.draftPick.findFirst({
    where: { draftId: pack.draftId, playerId: chosenPlayerId },
    select: { id: true },
  });
  if (alreadyDrafted) {
    throw new Error("That player was drafted elsewhere since this pack opened");
  }

  await prisma.$transaction([
    prisma.draftPick.updateMany({
      where: { draftId: pack.draftId, teamId: pack.teamId, playerId: pack.tradedPlayerId },
      data: { playerId: chosenPlayerId },
    }),
    prisma.cardPack.update({
      where: { id: packId },
      data: { chosenPlayerId },
    }),
  ]);
}
