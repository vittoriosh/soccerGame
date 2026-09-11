import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { playerImageSrc } from "@/lib/player-image";
import { flagUrl } from "@/lib/country-flags";
import { groupLabel, type PositionGroup } from "@/lib/positions";
import { cardTierBorderClass } from "@/lib/card-tier";
import { getUnresolvedPacks, getTradeInsUsed, MAX_TRADE_INS } from "@/lib/card-packs";
import { tradeIn, openPack } from "./actions";
import { packsEnabled } from "@/lib/features";

export const dynamic = "force-dynamic";

export default async function CardPacksPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!packsEnabled()) redirect("/draft");
  const { id } = await params;
  const draftId = Number.parseInt(id, 10);
  if (!draftId) notFound();

  const draft = await prisma.draft.findUnique({ where: { id: draftId } });
  if (!draft) notFound();
  if (!draft.userTeamId) redirect(`/draft/${draftId}/pick-team`);
  if (!draft.cardPacksEnabled || draft.status !== "complete") {
    redirect(`/draft/${draftId}`);
  }
  const userTeamId = draft.userTeamId;

  const unresolvedPacks = await getUnresolvedPacks(draftId, userTeamId);

  if (unresolvedPacks.length > 0) {
    const allCandidateIds = unresolvedPacks.flatMap((p) => p.candidateIds.split(",").map(Number));
    const tradedPlayerIds = unresolvedPacks.map((p) => p.tradedPlayerId);
    const players = await prisma.player.findMany({
      where: { id: { in: [...allCandidateIds, ...tradedPlayerIds] } },
    });
    const playerById = new Map(players.map((p) => [p.id, p]));

    return (
      <div className="flex-1 bg-background text-foreground">
        <Header draftId={draftId} />
        <main className="mx-auto max-w-4xl px-6 py-10">
          <h1 className="text-2xl font-semibold tracking-tight">Open Your Packs</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            Pick one player from each pack — it swaps in for the player you traded away.
          </p>

          <div className="mt-6 space-y-8">
            {unresolvedPacks.map((pack) => {
              const tradedPlayer = playerById.get(pack.tradedPlayerId);
              const candidates = pack.candidateIds
                .split(",")
                .map(Number)
                .map((id) => playerById.get(id))
                .filter((p): p is NonNullable<typeof p> => !!p);
              return (
                <div key={pack.id}>
                  <h2 className="text-sm font-semibold text-black/70 dark:text-white/70">
                    Pack for trading in {tradedPlayer?.name ?? "a player"}
                  </h2>
                  <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-5">
                    {candidates.map((player) => (
                      <form key={player.id} action={openPack}>
                        <input type="hidden" name="draftId" value={draftId} />
                        <input type="hidden" name="packId" value={pack.id} />
                        <input type="hidden" name="chosenPlayerId" value={player.id} />
                        <button
                          type="submit"
                          className={`flex w-full flex-col items-center gap-1 rounded-lg px-2 py-3 text-center transition hover:-translate-y-0.5 ${cardTierBorderClass(player.overall)}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={playerImageSrc(player.imageUrl)}
                            alt=""
                            width={44}
                            height={44}
                            className="h-11 w-11 rounded-full bg-black/5 object-cover dark:bg-white/10"
                          />
                          <div className="text-lg font-black leading-none">{player.overall}</div>
                          <div className="truncate text-xs font-medium">{player.name}</div>
                          <div className="flex items-center gap-1 text-[10px] text-black/50 dark:text-white/50">
                            {flagUrl(player.nationality) && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={flagUrl(player.nationality)!}
                                alt=""
                                width={12}
                                height={9}
                                className="h-[9px] w-[12px] rounded-[1px] object-cover"
                              />
                            )}
                            <span className="truncate">{player.club}</span>
                          </div>
                        </button>
                      </form>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      </div>
    );
  }

  const tradeInsUsed = await getTradeInsUsed(draftId, userTeamId);
  const remaining = Math.max(0, MAX_TRADE_INS - tradeInsUsed);

  if (remaining === 0) {
    return (
      <div className="flex-1 bg-background text-foreground">
        <Header draftId={draftId} />
        <main className="mx-auto max-w-3xl px-6 py-10">
          <h1 className="text-2xl font-semibold tracking-tight">Card Packs</h1>
          <p className="mt-2 text-sm text-black/60 dark:text-white/60">
            You&apos;ve already used all {MAX_TRADE_INS} of your trade-ins for this draft.
          </p>
          <Link
            href={`/draft/${draftId}`}
            className="mt-6 inline-block rounded-md bg-foreground px-6 py-3 text-sm font-semibold text-background transition hover:opacity-90"
          >
            Back to your squad
          </Link>
        </main>
      </div>
    );
  }

  const mySquad = await prisma.draftPick.findMany({
    where: { draftId, teamId: userTeamId },
    orderBy: { pickNumber: "asc" },
    include: { player: true },
  });

  return (
    <div className="flex-1 bg-background text-foreground">
      <Header draftId={draftId} />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Card Packs</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Your draft is complete — now, if you want, trade in up to {remaining} more of your
          drafted players ({MAX_TRADE_INS} total for this draft). Each one becomes a pack of 5
          random same-position players (from your selected leagues, nobody already drafted). Pick
          one from each pack to take their place.
        </p>

        <form action={tradeIn} className="mt-6">
          <input type="hidden" name="draftId" value={draftId} />
          <div className="grid gap-2 sm:grid-cols-2">
            {mySquad.map((pick) => (
              <label
                key={pick.id}
                className="flex items-center gap-2 rounded-lg border border-black/10 px-3 py-2.5 text-sm hover:bg-black/[0.03] dark:border-white/15 dark:hover:bg-white/[0.05]"
              >
                <input
                  type="checkbox"
                  name="tradedPlayerIds"
                  value={pick.player.id}
                  className="h-4 w-4 shrink-0"
                />
                <span className="w-8 shrink-0 font-semibold">{pick.player.overall}</span>
                <span className="min-w-0 flex-1 truncate">{pick.player.name}</span>
                <span className="shrink-0 text-xs text-black/40 dark:text-white/40">
                  {groupLabel(pick.player.positionGroup as PositionGroup)}
                </span>
              </label>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="rounded-md bg-foreground px-6 py-3 text-sm font-semibold text-background transition hover:opacity-90"
            >
              Trade In Selected
            </button>
            <Link
              href={`/draft/${draftId}`}
              className="rounded-md border border-black/15 px-6 py-3 text-sm font-semibold transition hover:bg-black/[0.03] dark:border-white/20 dark:hover:bg-white/[0.05]"
            >
              No thanks, keep my squad
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}

function Header({ draftId }: { draftId: number }) {
  return (
    <header className="border-b border-black/10 dark:border-white/10">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Matchday Manager
        </Link>
        <nav className="flex items-center gap-6 text-sm text-black/60 dark:text-white/60">
          <Link href="/players" className="hover:text-foreground">
            Players
          </Link>
          <Link href={`/draft/${draftId}`} className="text-foreground">
            Draft
          </Link>
        </nav>
      </div>
    </header>
  );
}
