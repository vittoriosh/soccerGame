import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { clubLogoSrc } from "@/lib/player-image";
import { groupByPosition, STARTER_CAPS, type PositionGroup } from "@/lib/positions";
import { computeUnifiedRating } from "@/lib/team-rating";
import { computePlayerChemistry, applyCoachChemistryBoost, averageChemistry } from "@/lib/chemistry";
import {
  FormationPitch,
  PlayerCard,
  PlayerCardContent,
  computeCardVisual,
  type PitchPick,
} from "@/components/formation-pitch";
import { TeamRatingSummary } from "@/components/team-rating-badges";
import { CoachCard } from "@/components/coach-card";
import { PackSlotOutline } from "@/components/pack-slot-outline";
import { StadiumShell } from "@/components/stadium-shell";
import { bebas } from "@/lib/game-fonts";
import {
  PACK_TIERS,
  SQUAD_SIZE,
  applyCardBoost,
  remainingCapacity,
  type PackOpeningPayload,
  type CardColor,
} from "@/lib/packs";
import { resolveOpening, resolveCoachOpening, skipOpening } from "./actions";

const CATEGORY_LABELS: Record<PositionGroup, string> = {
  FWD: "Attack",
  MID: "Midfield",
  DEF: "Defence",
  GK: "GK",
};
const CATEGORY_ORDER: PositionGroup[] = ["FWD", "MID", "DEF", "GK"];

const TIER_SUMMARIES = PACK_TIERS.map((t) => ({
  key: t.key,
  name: t.name,
  price: t.price,
  enhancedChance: t.enhancedChance,
}));

export default async function PackRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const packRunId = Number.parseInt(id, 10);
  if (!packRunId) notFound();

  const run = await prisma.packRun.findUnique({ where: { id: packRunId } });
  if (!run) notFound();

  const opening = await prisma.packOpening.findFirst({ where: { packRunId } });

  if (opening) {
    const payload: PackOpeningPayload = JSON.parse(opening.candidates);
    const tierName = PACK_TIERS.find((t) => t.key === opening.tier)?.name ?? "Pack";
    const actionsDelay = `${payload.items.length * 0.45 + 0.15}s`;

    if (payload.kind === "coach") {
      return (
        <StadiumShell scrollable>
          <main className="mx-auto w-full max-w-4xl pb-12">
            <p className={`${bebas.className} text-sm tracking-[0.35em] text-white/55`}>
              Pack Opened
            </p>
            <h1 className={`${bebas.className} mt-2 text-5xl tracking-wide text-white`}>
              {tierName} · Coach
            </h1>
            <p className="mt-2 text-sm text-white/55">Pick 1 to hire</p>

            <form action={resolveCoachOpening} className="mt-8">
              <input type="hidden" name="packRunId" value={packRunId} />
              <input type="hidden" name="openingId" value={opening.id} />

              <div
                className="grid grid-cols-2 gap-3 sm:grid-cols-5"
                style={{ perspective: "1000px" }}
              >
                {payload.items.map((coach, i) => {
                  const crest = clubLogoSrc(coach.clubId, 60);
                  return (
                    <label
                      key={coach.name}
                      style={{ animationDelay: `${i * 0.45}s` }}
                      className="pack-card-reveal flex cursor-pointer flex-col items-center gap-1.5 border-2 border-white/35 bg-black/55 px-2 py-4 text-center transition hover:border-white has-[:checked]:border-white has-[:checked]:bg-white has-[:checked]:text-black"
                    >
                      <input type="radio" name="selected" value={coach.name} className="sr-only" />
                      {crest && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={crest}
                          alt=""
                          width={40}
                          height={40}
                          className="h-10 w-10 object-contain"
                        />
                      )}
                      <div className={`${bebas.className} text-3xl leading-none`}>{coach.rating}</div>
                      <div className="truncate text-xs font-medium">{coach.name}</div>
                      <div className="truncate text-[10px] opacity-60">{coach.club}</div>
                    </label>
                  );
                })}
              </div>

              <div
                className="pack-actions-reveal mt-8 flex flex-wrap items-center justify-center gap-4"
                style={{ animationDelay: actionsDelay }}
              >
                <button
                  type="submit"
                  className={`${bebas.className} border-2 border-white bg-white px-12 py-5 text-3xl tracking-[0.12em] text-black transition hover:bg-transparent hover:text-white`}
                >
                  Hire Selected
                </button>
              </div>
            </form>

            <form
              action={skipOpening}
              className="pack-actions-reveal mt-4 text-center"
              style={{ animationDelay: actionsDelay }}
            >
              <input type="hidden" name="packRunId" value={packRunId} />
              <input type="hidden" name="openingId" value={opening.id} />
              <button
                type="submit"
                className="text-xs tracking-wide text-white/40 underline transition hover:text-white/70"
              >
                Discard pack (no refund)
              </button>
            </form>
          </main>
        </StadiumShell>
      );
    }

    const players = await prisma.player.findMany({
      where: { id: { in: payload.items.map((c) => c.playerId) } },
    });
    const playerById = new Map(players.map((p) => [p.id, p]));
    const revealed = payload.items
      .map((c) => {
        const player = playerById.get(c.playerId);
        if (!player) return null;
        return { ...c, player: applyCardBoost(player, c.boost) };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    return (
      <StadiumShell scrollable>
        <main className="mx-auto w-full max-w-5xl pb-12">
          <p className={`${bebas.className} text-sm tracking-[0.35em] text-white/55`}>
            Pack Opened
          </p>
          <h1 className={`${bebas.className} mt-2 text-5xl tracking-wide text-white`}>
            {tierName} · {CATEGORY_LABELS[payload.positionGroup]}
          </h1>
          <p className="mt-2 text-sm text-white/55">Pick 1 to keep</p>

          <form action={resolveOpening} className="mt-8">
            <input type="hidden" name="packRunId" value={packRunId} />
            <input type="hidden" name="openingId" value={opening.id} />

            <div className="flex flex-wrap justify-center gap-4" style={{ perspective: "1000px" }}>
              {revealed.map((c, i) => {
                const pick: PitchPick = { id: c.playerId, color: c.color, player: c.player };
                const visual = computeCardVisual(pick);
                return (
                  <label
                    key={c.playerId}
                    style={{ animationDelay: `${i * 0.45}s`, ...visual.wrapperStyle }}
                    className={`pack-card-reveal cursor-pointer has-[:checked]:ring-4 has-[:checked]:ring-white has-[:checked]:ring-offset-2 has-[:checked]:ring-offset-black ${visual.wrapperClassName}`}
                  >
                    <input
                      type="radio"
                      name="selected"
                      value={c.playerId}
                      className="sr-only"
                    />
                    <PlayerCardContent pick={pick} visual={visual} />
                  </label>
                );
              })}
            </div>

            <div
              className="pack-actions-reveal mt-8 flex flex-wrap items-center justify-center gap-4"
              style={{ animationDelay: actionsDelay }}
            >
              <button
                type="submit"
                className={`${bebas.className} border-2 border-white bg-white px-12 py-5 text-3xl tracking-[0.12em] text-black transition hover:bg-transparent hover:text-white`}
              >
                Keep Selected
              </button>
            </div>
          </form>

          <form
            action={skipOpening}
            className="pack-actions-reveal mt-4 text-center"
            style={{ animationDelay: actionsDelay }}
          >
            <input type="hidden" name="packRunId" value={packRunId} />
            <input type="hidden" name="openingId" value={opening.id} />
            <button
              type="submit"
              className="text-xs tracking-wide text-white/40 underline transition hover:text-white/70"
            >
              Discard pack (no refund)
            </button>
          </form>
        </main>
      </StadiumShell>
    );
  }

  const packPlayers = await prisma.packPlayer.findMany({
    where: { packRunId },
    orderBy: { acquiredAt: "asc" },
  });
  const squadCount = packPlayers.length;
  const playersById = new Map(
    (
      await prisma.player.findMany({ where: { id: { in: packPlayers.map((p) => p.playerId) } } })
    ).map((p) => [p.id, p]),
  );
  const squadPicks = packPlayers
    .map((pp) => {
      const base = playersById.get(pp.playerId);
      if (!base) return null;
      const boosted = applyCardBoost(base, pp.boost);
      return {
        id: pp.id,
        positions: boosted.positions,
        color: pp.color as CardColor | null,
        player: boosted,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);
  const squadByPosition = groupByPosition(squadPicks);

  const coachRating = run.coachRating ?? undefined;
  const baseChemistry = computePlayerChemistry(
    squadPicks.map((p) => ({
      id: p.player.id,
      club: p.player.club,
      league: p.player.league,
      nationality: p.player.nationality,
    })),
  );
  const chemistry = applyCoachChemistryBoost(baseChemistry, coachRating);
  const teamChemistry = averageChemistry(chemistry);
  const unified = computeUnifiedRating(squadByPosition, chemistry, coachRating);
  const pureAverage =
    squadPicks.length === 0
      ? 0
      : Math.round(
          (squadPicks.reduce((s, p) => s + p.player.overall, 0) / squadPicks.length) * 10,
        ) / 10;

  if (run.status === "complete") {
    return (
      <StadiumShell scrollable>
        <main className="mx-auto w-full max-w-5xl pb-12">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className={`${bebas.className} text-sm tracking-[0.35em] text-white/55`}>
                Packs Complete
              </p>
              <h1 className={`${bebas.className} mt-1 text-5xl tracking-wide text-white`}>
                Your Squad
              </h1>
              <p className="mt-1 text-sm text-white/50">
                ${run.cash.toLocaleString()} left unspent
              </p>
            </div>
            <Link
              href="/"
              className={`${bebas.className} border border-white/40 bg-black/40 px-5 py-2.5 text-lg tracking-wide text-white transition hover:border-white hover:bg-white hover:text-black`}
            >
              Menu
            </Link>
          </div>

          <div className="mt-6">
            <TeamRatingSummary
              rating={unified.rating}
              pureAverage={pureAverage}
              chemistry={teamChemistry}
              coachRating={coachRating}
              experienceLabel={unified.experienceLabel}
              experienceDelta={unified.experienceDelta}
              hasSquad={squadPicks.length > 0}
            />
          </div>

          <div className="mt-4 max-w-sm">
            <CoachCard
              coach={
                run.coachName
                  ? {
                      name: run.coachName,
                      club: run.coachClub ?? "",
                      clubId: run.coachClubId,
                      rating: run.coachRating ?? 0,
                    }
                  : null
              }
            />
          </div>

          <div className="mt-6 min-h-[560px]">
            <FormationPitch
              squadByPosition={squadByPosition}
              chemistry={chemistry}
              coachRating={coachRating}
            />
          </div>
        </main>
      </StadiumShell>
    );
  }

  const capacityLeft = remainingCapacity(squadCount);
  const fillProgress = Math.min(100, (squadCount / SQUAD_SIZE) * 100);

  return (
    <StadiumShell fill>
      <main className="mx-auto flex h-full min-h-0 w-full max-w-[1400px] flex-col">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-3">
          <div className="min-w-0">
            <h1 className={`${bebas.className} truncate text-3xl tracking-wide text-white`}>
              Pack Squad
            </h1>
          </div>
          <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-start sm:gap-5">
            {squadCount > 0 && (
              <div className="text-right">
                <div className={`${bebas.className} text-2xl leading-none text-white`}>
                  {unified.rating.toFixed(1)}
                </div>
                <div className="text-[10px] tracking-[0.18em] text-white/40 uppercase">Rating</div>
              </div>
            )}
            <div className="text-right">
              <div className={`${bebas.className} text-2xl leading-none text-white`}>
                ${run.cash.toLocaleString()}
              </div>
              <div className="text-[10px] tracking-[0.18em] text-white/40 uppercase">Cash</div>
            </div>
            <div className="w-28 sm:w-48">
              <div className="mb-1 flex justify-between text-[10px] tracking-[0.16em] text-white/45 uppercase">
                <span>
                  {squadCount}/{SQUAD_SIZE}
                </span>
                <span>{capacityLeft} left</span>
              </div>
              <div className="h-0.5 bg-white/15">
                <div className="h-full bg-white" style={{ width: `${fillProgress}%` }} />
              </div>
            </div>
            <Link
              href="/"
              aria-label="Menu"
              className={`${bebas.className} flex h-8 w-8 items-center justify-center border border-white/35 bg-black/40 text-xl leading-none text-white/70 transition hover:border-white hover:text-white sm:h-auto sm:w-auto sm:px-3 sm:py-1.5 sm:text-sm sm:tracking-wide`}
            >
              <span aria-hidden className="sm:hidden">×</span>
              <span className="hidden sm:inline">Menu</span>
            </Link>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(280px,340px)_1fr]">
          <section className="flex min-h-0 flex-col bg-black/50 backdrop-blur-sm">
            <div className="shrink-0 px-4 pt-4">
              <TeamRatingSummary
                rating={unified.rating}
                pureAverage={pureAverage}
                chemistry={teamChemistry}
                coachRating={coachRating}
                experienceLabel={unified.experienceLabel}
                experienceDelta={unified.experienceDelta}
                hasSquad={squadCount > 0}
              />
            </div>
            <div className="mt-4 shrink-0 px-4">
              <CoachCard
                coach={
                  run.coachName
                    ? {
                        name: run.coachName,
                        club: run.coachClub ?? "",
                        clubId: run.coachClubId,
                        rating: run.coachRating ?? 0,
                      }
                    : null
                }
              />
            </div>
            <p className="mt-auto px-4 py-4 text-[11px] leading-relaxed text-white/40">
              Click an empty outline on the pitch to buy a pack for that slot.
            </p>
          </section>

          <section className="relative min-h-0 overflow-y-auto">
            <div className="relative min-h-full overflow-hidden rounded-2xl bg-emerald-900/70">
              <div className="pointer-events-none absolute inset-3 rounded-lg border border-white/15" />
              <div className="pointer-events-none absolute top-1/2 right-3 left-3 border-t border-white/15" />
              <div className="pointer-events-none absolute top-1/2 left-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15" />

              <div className="relative flex flex-col gap-5 px-4 py-8 sm:px-8">
                {CATEGORY_ORDER.map((group) => {
                  const picks = squadByPosition[group];
                  const cap = STARTER_CAPS[group];
                  return (
                    <div
                      key={group}
                      className="flex flex-wrap items-start justify-center gap-x-4 gap-y-4"
                    >
                      {Array.from({ length: cap }).map((_, i) => {
                        const pick = picks[i];
                        if (pick) {
                          return (
                            <PlayerCard
                              key={pick.id}
                              pick={pick}
                              chem={chemistry.get(pick.player.id)}
                              coachRating={coachRating}
                            />
                          );
                        }
                        return (
                          <PackSlotOutline
                            key={`${group}-${i}`}
                            kind="player"
                            group={group}
                            packRunId={packRunId}
                            cash={run.cash}
                            tiers={TIER_SUMMARIES}
                            label={CATEGORY_LABELS[group]}
                          />
                        );
                      })}
                    </div>
                  );
                })}

                <div className="flex justify-center border-t border-white/15 pt-5">
                  {run.coachName ? (
                    <div className="w-72">
                      <CoachCard
                        coach={{
                          name: run.coachName,
                          club: run.coachClub ?? "",
                          clubId: run.coachClubId,
                          rating: run.coachRating ?? 0,
                        }}
                      />
                    </div>
                  ) : (
                    <PackSlotOutline
                      kind="coach"
                      packRunId={packRunId}
                      cash={run.cash}
                      tiers={TIER_SUMMARIES}
                      label="Coach"
                    />
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </StadiumShell>
  );
}
