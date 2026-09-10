import Link from "next/link";
import { prisma } from "@/lib/db";
import { clubLogoSrc } from "@/lib/player-image";
import { POSITION_GROUPS, type PositionGroup } from "@/lib/positions";
import { PlayerCardContent, computeCardVisual, type PitchPick } from "@/components/formation-pitch";
import {
  PACK_TIERS,
  CARD_COLORS,
  applyCardBoost,
  generatePackCandidates,
  generateCoachPackCandidates,
  type CardColor,
  type PackTierConfig,
} from "@/lib/packs";

// Demo-only — deliberately not in PACK_TIERS, so it's not purchasable (or
// priced) anywhere in real gameplay, just something to look at here. Beats
// Diamond on both axes: more likely to roll enhanced at all, and when it
// does, almost guaranteed to pull from the elite 90+ band.
export const dynamic = "force-dynamic";

const LEGENDARY_TIER: PackTierConfig = {
  key: "legendary",
  name: "Legendary Pack",
  price: 0,
  enhancedChance: 0.6,
  bandWeights: [0, 0, 0.05, 0.95],
};
const DEMO_TIERS: PackTierConfig[] = [...PACK_TIERS, LEGENDARY_TIER];

const CATEGORY_LABELS: Record<PositionGroup, string> = {
  FWD: "Attack",
  MID: "Midfield",
  DEF: "Defence",
  GK: "GK",
};
const CATEGORY_ORDER: PositionGroup[] = ["FWD", "MID", "DEF", "GK"];

// A deterministic gallery instead of a random pull — one real card per
// rating tier, plus one per enhanced color (each shown at its color's max
// boost, since that's the version worth actually looking at). Labels match
// the actual texture tier each band renders with (see formation-pitch.tsx's
// isGoldTier/isSilverTier) — everything below 80 is the Silver texture,
// 80-89 is Gold, 90+ is Elite Gold — shown at a low and high example each
// so the range within a texture tier is visible too.
const TIER_PRESETS = [
  { label: "Silver (low)", min: 60, max: 69 },
  { label: "Silver (high)", min: 75, max: 79 },
  { label: "Gold (low)", min: 80, max: 84 },
  { label: "Gold (high)", min: 85, max: 89 },
  { label: "Elite Gold", min: 90, max: 99 },
] as const;
const COLOR_ORDER: CardColor[] = ["red", "dark_blue", "anime", "purple", "royal_gold", "flashback"];

function Header() {
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
          <Link href="/draft" className="hover:text-foreground">
            Draft
          </Link>
          <Link href="/packs" className="text-foreground">
            Packs
          </Link>
        </nav>
      </div>
    </header>
  );
}

function pillClass(active: boolean) {
  return `rounded-full px-3 py-1.5 text-xs font-semibold transition ${
    active
      ? "bg-foreground text-background"
      : "border border-black/15 text-black/60 hover:bg-black/5 dark:border-white/20 dark:text-white/60 dark:hover:bg-white/10"
  }`;
}

export default async function PackDemoPage({
  searchParams,
}: {
  searchParams: Promise<{ tier?: string; group?: string; kind?: string; r?: string }>;
}) {
  const { tier: tierParam, group: groupParam, kind: kindParam, r: rerollParam } =
    await searchParams;
  const tierKey = DEMO_TIERS.some((t) => t.key === tierParam) ? tierParam! : "diamond";
  const tier = DEMO_TIERS.find((t) => t.key === tierKey)!;
  const group: PositionGroup = POSITION_GROUPS.includes(groupParam as PositionGroup)
    ? (groupParam as PositionGroup)
    : "FWD";
  const showCoach = kindParam === "coach";
  const showStyles = kindParam === "styles";
  const reroll = Math.max(0, Number.parseInt(rerollParam ?? "0", 10) || 0) + 1;

  let playerPicks: PitchPick[] = [];
  let coachCards: Awaited<ReturnType<typeof generateCoachPackCandidates>> = [];
  let styleCards: { label: string; pick: PitchPick }[] = [];

  if (showStyles) {
    const tierPlayers = await Promise.all(
      TIER_PRESETS.map((p) =>
        prisma.player.findFirst({
          where: { positionGroup: group, overall: { gte: p.min, lte: p.max } },
          orderBy: { overall: "desc" },
        }),
      ),
    );
    const colorBasePlayer = await prisma.player.findFirst({
      where: { positionGroup: group, overall: { gte: 82, lte: 88 } },
      orderBy: { overall: "desc" },
    });

    styleCards = [
      ...TIER_PRESETS.map((p, i): { label: string; pick: PitchPick } | null => {
        const player = tierPlayers[i];
        if (!player) return null;
        return { label: p.label, pick: { id: player.id, color: null, player } };
      }),
      ...COLOR_ORDER.map((color): { label: string; pick: PitchPick } | null => {
        if (!colorBasePlayer) return null;
        const boost = CARD_COLORS[color].boostMax;
        return {
          label: CARD_COLORS[color].label,
          pick: { id: colorBasePlayer.id, color, player: applyCardBoost(colorBasePlayer, boost) },
        };
      }),
    ].filter((c): c is { label: string; pick: PitchPick } => c !== null);
  } else if (showCoach) {
    coachCards = generateCoachPackCandidates(tier);
  } else {
    const items = await generatePackCandidates(tier, group);
    const players = await prisma.player.findMany({ where: { id: { in: items.map((c) => c.playerId) } } });
    const playerById = new Map(players.map((p) => [p.id, p]));
    playerPicks = items
      .map((c): PitchPick | null => {
        const player = playerById.get(c.playerId);
        if (!player) return null;
        return { id: c.playerId, color: c.color, player: applyCardBoost(player, c.boost) };
      })
      .filter((p): p is PitchPick => p !== null);
  }

  return (
    <div className="flex-1 bg-background text-foreground">
      <Header />
      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Pack Demo</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Preview card designs and pull odds for any tier — doesn&apos;t spend cash, use a
          squad slot, or save anything.
        </p>

        {!showStyles && (
          <div className="mt-6 flex flex-wrap gap-1.5">
            {DEMO_TIERS.map((t) => (
              <Link
                key={t.key}
                href={`/packs/demo?tier=${t.key}${showCoach ? "&kind=coach" : `&group=${group}`}`}
                className={pillClass(tierKey === t.key)}
              >
                {t.name}
                {t.key === "legendary" && " ⚡"}
              </Link>
            ))}
          </div>
        )}

        <div className={`flex flex-wrap gap-1.5 ${showStyles ? "mt-6" : "mt-2"}`}>
          {CATEGORY_ORDER.map((g) => (
            <Link
              key={g}
              href={`/packs/demo?tier=${tierKey}&group=${g}${showStyles ? "&kind=styles" : ""}`}
              className={pillClass(!showCoach && group === g)}
            >
              {CATEGORY_LABELS[g]}
            </Link>
          ))}
          <Link href={`/packs/demo?tier=${tierKey}&kind=coach`} className={pillClass(showCoach)}>
            Coach
          </Link>
          <Link href={`/packs/demo?tier=${tierKey}&group=${group}&kind=styles`} className={pillClass(showStyles)}>
            Card Styles
          </Link>
        </div>

        {!showStyles && (
          <Link
            href={`/packs/demo?tier=${tierKey}${showCoach ? "&kind=coach" : `&group=${group}`}&r=${reroll}`}
            className="mt-5 inline-block rounded-md bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition hover:opacity-90"
          >
            🎲 Reroll
          </Link>
        )}

        <div className="mt-8 flex flex-wrap justify-center gap-4" style={{ perspective: "1000px" }}>
          {showStyles
            ? styleCards.map(({ label, pick }, i) => {
                const visual = computeCardVisual(pick);
                return (
                  <div key={label} className="flex flex-col items-center gap-2">
                    <div
                      style={{ animationDelay: `${i * 0.15}s`, ...visual.wrapperStyle }}
                      className={`pack-card-reveal ${visual.wrapperClassName}`}
                    >
                      <PlayerCardContent pick={pick} visual={visual} />
                    </div>
                    <span className="text-xs font-semibold text-black/60 dark:text-white/60">{label}</span>
                  </div>
                );
              })
            : showCoach
              ? coachCards.map((coach, i) => {
                  const crest = clubLogoSrc(coach.clubId, 60);
                  return (
                    <div
                      key={coach.name}
                      style={{ animationDelay: `${i * 0.45}s` }}
                      className="pack-card-reveal flex w-44 flex-col items-center gap-1.5 rounded-lg border-2 border-neutral-900 bg-neutral-50 px-2 py-5 text-center dark:border-neutral-200 dark:bg-neutral-900"
                    >
                      {crest && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={crest} alt="" width={48} height={48} className="h-12 w-12 object-contain" />
                      )}
                      <div className="text-xl font-black leading-none text-neutral-900 dark:text-neutral-50">
                        {coach.rating}
                      </div>
                      <div className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{coach.name}</div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">{coach.club}</div>
                    </div>
                  );
                })
              : playerPicks.map((pick, i) => {
                  const visual = computeCardVisual(pick);
                  return (
                    <div
                      key={pick.id}
                      style={{ animationDelay: `${i * 0.45}s`, ...visual.wrapperStyle }}
                      className={`pack-card-reveal ${visual.wrapperClassName}`}
                    >
                      <PlayerCardContent pick={pick} visual={visual} />
                    </div>
                  );
                })}
          {!showCoach && !showStyles && playerPicks.length === 0 && (
            <p className="text-sm text-black/50 dark:text-white/50">No players available for that position.</p>
          )}
        </div>
      </main>
    </div>
  );
}
