import Link from "next/link";
import { playerImageSrc, clubLogoSrc } from "@/lib/player-image";
import { flagUrl } from "@/lib/country-flags";
import { POSITION_GROUPS, type PositionGroup } from "@/lib/positions";
import { computeEffectiveRating } from "@/lib/team-rating";
import { cardTierAccentBorderClass, cardTierGlowClass } from "@/lib/card-tier";
import { CARD_COLOR_STYLES, type CardColor } from "@/lib/packs";

export type PitchPick = {
  id: number;
  /** Set only for Packs-mode cards — an enhanced card's color overrides
   *  the normal gold-tier border/background/glow entirely rather than
   *  combining with it (the color itself IS this card's rarity signal). */
  color?: CardColor | null;
  player: {
    id: number;
    name: string;
    overall: number;
    potential: number;
    positions: string;
    positionGroup: string;
    imageUrl: string;
    nationality: string;
    club: string;
    clubId: number | null;
    league: string;
    /** Real-world year this card's stats are from (2015–2023, 2026, …) —
     *  the same real player has one row per year, so this is the only
     *  thing that tells two cards of the same person apart. */
    year: number;
    pace: number;
    shooting: number;
    passing: number;
    dribbling: number;
    defending: number;
    physic: number;
    goalkeepingDiving: number;
    goalkeepingHandling: number;
    goalkeepingKicking: number;
    goalkeepingReflexes: number;
    goalkeepingPositioning: number;
  };
};

const ROW_ORDER: PositionGroup[] = ["FWD", "MID", "DEF", "GK"];
const ROW_LABELS: Record<PositionGroup, string> = {
  FWD: "Forwards",
  MID: "Midfielders",
  DEF: "Defenders",
  GK: "Goalkeeper",
};

function chemDotColor(chem: number) {
  if (chem >= 7) return "bg-emerald-500";
  if (chem >= 4) return "bg-amber-500";
  return "bg-red-500";
}

/** Six-stat spread, FIFA-card style — goalkeeping stats for keepers, the
 *  usual outfield six for everyone else. */
function cardStats(player: PitchPick["player"]): { label: string; value: number }[] {
  if (player.positionGroup === "GK") {
    return [
      { label: "DIV", value: player.goalkeepingDiving },
      { label: "HAN", value: player.goalkeepingHandling },
      { label: "KIC", value: player.goalkeepingKicking },
      { label: "REF", value: player.goalkeepingReflexes },
      { label: "SPD", value: player.pace },
      { label: "POS", value: player.goalkeepingPositioning },
    ];
  }
  return [
    { label: "PAC", value: player.pace },
    { label: "SHO", value: player.shooting },
    { label: "PAS", value: player.passing },
    { label: "DRI", value: player.dribbling },
    { label: "DEF", value: player.defending },
    { label: "PHY", value: player.physic },
  ];
}

/** `"auto"` is the normal theme-aware light/dark toggle (no background
 *  image). `"light"` is elite gold + enhanced colors — dark, busy
 *  photographic art that needs forced white text regardless of site theme.
 *  `"dark"` is the plain 80–89 gold tier — a light, flat gradient image
 *  that needs forced dark text for the same reason (the image itself never
 *  changes with the toggle, so neither should the text mode). */
type TextMode = "auto" | "light" | "dark";

function statColor(value: number, textMode: TextMode = "auto") {
  if (textMode === "light") return "text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.95),0_0_6px_rgba(0,0,0,0.7)]";
  if (textMode === "dark") {
    if (value >= 85) return "text-emerald-700";
    if (value >= 70) return "text-neutral-700";
    return "text-neutral-600";
  }
  if (value >= 85) return "text-emerald-600 dark:text-emerald-400";
  if (value >= 70) return "text-neutral-700 dark:text-neutral-300";
  return "text-neutral-500 dark:text-neutral-500";
}

/** Every non-enhanced-color card now gets a real texture, banded by rating:
 *  80+ (both the 80-89 tier and elite 90+) share the same gold-metal foil
 *  (the rare ornate gold art moved to the Royal Gold enhanced color — see
 *  CARD_COLOR_STYLES.royal_gold — since that's the better home for the most
 *  elaborate art), and everything below 80 gets a silver-metal texture —
 *  no more plain untextured cards at any rating. 90+ still stands out via
 *  its glow (cardTierGlowClass) even though the art itself now matches —
 *  PLUS a chance at the fancier GOLD_ELITE_RARE_TEXTURE instead (see
 *  isRareGold below), so elite cards aren't all visually identical either. */
const GOLD_ELITE_TEXTURE = "/cards/gold-elite-bg.jpeg";
const GOLD_ELITE_RARE_TEXTURE = "/cards/gold-elite-rare-bg.jpeg";
const SILVER_TIER_TEXTURE = "/cards/silver-bg.jpeg";

/** Every number/class a card's visuals need, computed once so the squad
 *  view (a `<Link>`) and the pack-opening reveal (a `<label>`, selectable —
 *  see PackCandidateCard) render byte-for-byte the same card instead of
 *  two designs quietly drifting apart. */
function computeCardVisual(pick: PitchPick, chem?: number, coachRating?: number) {
  const live =
    chem !== undefined
      ? computeEffectiveRating(pick.player.overall, pick.player.potential, chem, coachRating)
      : pick.player.overall;
  const delta = live - pick.player.overall;
  const colorStyle = pick.color ? CARD_COLOR_STYLES[pick.color] : null;
  // Tier/texture are a fixed property of the card — printed at pack-opening
  // time, same as a real trading card — not something that should shift as
  // squad chemistry fluctuates turn to turn. Base off `pick.player.overall`
  // (already boost-adjusted for pack cards), never `live`; chemistry only
  // ever changes the displayed number and its up/down color below.
  const isElite = !colorStyle && pick.player.overall >= 90;
  const isGoldTier = !colorStyle && !isElite && pick.player.overall >= 80;
  const isSilverTier = !colorStyle && !isElite && !isGoldTier;

  const tierBorder = colorStyle
    ? colorStyle.border
    : isSilverTier
      ? "border-neutral-400 dark:border-neutral-400"
      : cardTierAccentBorderClass(pick.player.overall, "border-neutral-900 dark:border-neutral-200");
  const tierGlow = colorStyle ? colorStyle.glow : cardTierGlowClass(pick.player.overall);

  // A minority of elite (90+) cards get the fancier "Rare Gold" art instead
  // of the plain one — keyed off the real player's id (stable per real
  // person+year, not re-rolled on every render) so the same card always
  // shows the same variant instead of flickering between them.
  const isRareGold = isElite && pick.player.id % 4 === 0;
  const backgroundImageUrl =
    colorStyle?.backgroundImage ??
    (isRareGold ? GOLD_ELITE_RARE_TEXTURE : isElite || isGoldTier ? GOLD_ELITE_TEXTURE : SILVER_TIER_TEXTURE);
  // 80-89 now shares elite's gold-metal art, so it shares elite's "light"
  // (white-forced, scrim-protected) text treatment too — only the silver
  // (<80) tier, on its own plainer/flatter image, still uses dark text.
  const textMode: TextMode = colorStyle || isElite || isGoldTier ? "light" : "dark";

  const wrapperClassName = `group relative flex w-[42vw] min-w-32 max-w-44 flex-col overflow-hidden rounded-xl border-[3px] bg-neutral-950 bg-cover bg-center transition hover:-translate-y-1 sm:w-44 ${tierBorder} ${tierGlow || "shadow-md hover:shadow-xl"}`;

  const wrapperStyle: { backgroundImage?: string } = { backgroundImage: `url(${backgroundImageUrl})` };

  return { live, delta, colorStyle, isElite, isGoldTier, isSilverTier, isRareGold, textMode, wrapperClassName, wrapperStyle };
}

/** The card's full visual content — everything except the outer element,
 *  so a squad card (`<Link>`) and a selectable pack-reveal card (`<label>`)
 *  share this identically. */
export function PlayerCardContent({
  pick,
  chem,
  coachRating,
  visual,
}: {
  pick: PitchPick;
  chem?: number;
  coachRating?: number;
  visual: ReturnType<typeof computeCardVisual>;
}) {
  const { live, delta, colorStyle, textMode } = visual;
  const position = pick.player.positions.split(",")[0];
  const flag = flagUrl(pick.player.nationality);
  const crest = clubLogoSrc(pick.player.clubId, 30);
  const stats = cardStats(pick.player);
  const yearShort = String(pick.player.year).slice(-2);

  // Photographic-texture cards go monochrome (white on the dark elite/color
  // art, dark on the light 80-89 gold art) instead of the usual tiered/
  // colored text — the art underneath already carries color, so extra hues
  // were just competing with it. Hierarchy comes from opacity instead. The
  // dark art shows through almost undimmed (see the scrim below), so its
  // white text gets a tight drop shadow instead of a dark wash muting the
  // texture; the light gold art needs no such help.
  const textShadow = textMode === "light" ? "[text-shadow:0_1px_2px_rgba(0,0,0,0.95),0_0_6px_rgba(0,0,0,0.7)]" : "";
  const infoTextClass =
    textMode === "light"
      ? `text-white ${textShadow}`
      : textMode === "dark"
        ? "text-neutral-900"
        : "text-neutral-900 dark:text-neutral-50";
  const clubTextClass =
    textMode === "light"
      ? `text-white/70 ${textShadow}`
      : textMode === "dark"
        ? "text-neutral-700"
        : "text-neutral-500 dark:text-neutral-400";
  const statLabelClass =
    textMode === "light"
      ? `text-white/60 ${textShadow}`
      : textMode === "dark"
        ? "text-neutral-500"
        : "text-neutral-400 dark:text-neutral-500";
  const statDividerClass = textMode === "light" ? "border-white/15" : "border-neutral-900/15";
  // A soft glowing ring instead of a flat black/white circle — the photo
  // should feel set into the art, not pasted on top of it with a hard cut
  // line. Tier/color-tinted so it reads as part of the same finish as the
  // border/glow around the rest of the card.
  const photoRingClass =
    textMode === "light"
      ? colorStyle
        ? colorStyle.ring
        : "border border-amber-200/60 shadow-[0_0_18px_rgba(252,211,77,0.55)] bg-neutral-800"
      : "border-2 border-neutral-400/60 shadow-[0_0_10px_rgba(163,163,163,0.4)] bg-white";

  return (
    <>
      {/* Photographic-texture cards show the art directly instead of a
       *  flat-gradient card's usual glossy/foil overlays. The dark elite/
       *  color art gets barely any scrim (just enough at the bottom to
       *  anchor the stat row) since its white text carries its own drop
       *  shadow; the light gold/silver art needs no scrim, just a foil
       *  sheen. */}
      {textMode === "light" ? (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/0 via-black/0 to-black/45" />
      ) : (
        <>
          <div className="pointer-events-none absolute inset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_25%,rgba(255,255,255,0.55)_45%,transparent_65%)]" />
        </>
      )}

      {chem !== undefined && (
        <span
          title={`Chemistry ${chem}/10`}
          className={`absolute right-1.5 top-1.5 z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white shadow dark:border-neutral-900 ${chemDotColor(chem)}`}
        >
          {chem}
        </span>
      )}

      {/* Header zone: rating/position/flag/crest stacked top-left, a big
       *  photo pushed up into the top-right corner instead of a small
       *  centered headshot — closer to how real card games spend this
       *  space, and it puts the photo where your eye actually lands. A
       *  small edition tag overlaps the photo's bottom-left corner — the
       *  only thing that tells two cards of the same real player apart
       *  now that the pool spans many real-world years. */}
      <div className="relative h-[104px] px-2.5 pt-2.5">
        <div className={`flex flex-col items-start leading-none ${infoTextClass}`}>
          <span
            title={`Live rating ${live} — player rating, potential, and chemistry combined${
              delta !== 0 ? ` (base ${pick.player.overall}, ${delta > 0 ? "+" : ""}${delta} from chemistry${coachRating ? " & coach" : ""})` : ""
            }`}
            className={`text-[28px] font-black ${
              textMode === "light"
                ? "text-white"
                : textMode === "dark"
                  ? delta > 0
                    ? "text-emerald-700"
                    : delta < 0
                      ? "text-amber-700"
                      : "text-neutral-900"
                  : colorStyle
                    ? colorStyle.text
                    : delta > 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : delta < 0
                        ? "text-amber-600 dark:text-amber-500"
                        : ""
            }`}
          >
            {live}
          </span>
          <div className="mt-0.5 text-[11px] font-bold tracking-wide">{position}</div>
          {flag && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={flag}
              alt=""
              width={18}
              height={12}
              className="mt-1.5 h-3 w-[18px] shrink-0 rounded-[1px] object-cover"
            />
          )}
          {crest && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={crest} alt="" width={18} height={18} className="mt-1 h-[18px] w-[18px] shrink-0 object-contain" />
          )}
        </div>

        <div className={`absolute right-1.5 top-0.5 h-[88px] w-[88px] overflow-hidden rounded-full ${photoRingClass}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={playerImageSrc(pick.player.imageUrl)}
            alt=""
            width={88}
            height={88}
            className="h-full w-full object-cover"
          />
        </div>
        <span
          title={`${pick.player.year} card`}
          className={`absolute bottom-1 right-4 z-10 rounded px-1 py-0.5 text-[9px] font-black leading-none text-white ${
            textMode === "light"
              ? "border border-white/30 bg-black/50 backdrop-blur-sm"
              : "border border-white/80 bg-neutral-900 shadow dark:border-neutral-900/80 dark:bg-neutral-50 dark:text-neutral-900"
          }`}
        >
          &rsquo;{yearShort}
        </span>
      </div>

      <div
        className={`relative mx-2.5 mt-1 truncate rounded px-1.5 py-1 text-center text-[11px] font-bold uppercase tracking-wide ${
          textMode === "light"
            ? "bg-black/40 text-white"
            : "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
        }`}
      >
        {pick.player.name}
      </div>

      <div className={`relative mx-2.5 mt-0.5 truncate text-center text-[10px] ${clubTextClass}`}>
        {pick.player.club}
      </div>

      <div className={`relative mx-2.5 my-2 grid grid-cols-3 gap-x-1.5 gap-y-1.5 border-t pt-2 ${statDividerClass}`}>
        {stats.map((stat) => (
          <div key={stat.label} className="flex items-center justify-center gap-1 text-[10px]">
            <span className={`font-black ${statColor(stat.value, textMode)}`}>{stat.value}</span>
            <span className={`font-semibold ${statLabelClass}`}>{stat.label}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export function PlayerCard({
  pick,
  chem,
  coachRating,
}: {
  pick: PitchPick;
  chem?: number;
  coachRating?: number;
}) {
  const visual = computeCardVisual(pick, chem, coachRating);
  return (
    <Link href={`/players/${pick.player.id}`} className={visual.wrapperClassName} style={visual.wrapperStyle}>
      <PlayerCardContent pick={pick} chem={chem} coachRating={coachRating} visual={visual} />
    </Link>
  );
}

/** Exported so the pack-opening reveal screen can render the exact same
 *  card as a selectable `<label>` instead of a navigating `<Link>`. */
export { computeCardVisual };

const SLOT_COUNTS: Record<PositionGroup, number> = {
  FWD: 3,
  MID: 3,
  DEF: 4,
  GK: 1,
};

export function FormationPitch({
  squadByPosition,
  chemistry,
  coachRating,
  compact = false,
}: {
  squadByPosition: Record<PositionGroup, PitchPick[]>;
  chemistry?: Map<number, number>;
  coachRating?: number;
  compact?: boolean;
}) {
  const isEmpty = POSITION_GROUPS.every(
    (group) => squadByPosition[group].length === 0,
  );

  return (
    <div
      className={`relative h-full overflow-hidden rounded-2xl bg-emerald-800/90 ${
        compact ? "min-h-0" : ""
      }`}
    >
      <div className="pointer-events-none absolute inset-3 rounded-lg border border-white/20 sm:inset-4" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20" />
      <div className="pointer-events-none absolute inset-x-8 top-3 h-[18%] rounded-b-lg border border-t-0 border-white/20" />
      <div className="pointer-events-none absolute inset-x-8 bottom-3 h-[18%] rounded-t-lg border border-b-0 border-white/20" />

      {isEmpty && compact ? (
        <div className="relative flex h-full min-h-[280px] flex-col justify-around px-6 py-8">
          {ROW_ORDER.map((group) => (
            <div key={group} className="flex items-center justify-center gap-4">
              {Array.from({ length: SLOT_COUNTS[group] }).map((_, i) => (
                <span
                  key={i}
                  className="h-9 w-9 rounded-full border border-white/25 bg-black/20"
                  title={ROW_LABELS[group]}
                />
              ))}
            </div>
          ))}
        </div>
      ) : isEmpty ? (
        <div className="flex min-h-[560px] items-center justify-center px-6 text-center text-sm text-white/70">
          Your drafted players will line up here as you pick them.
        </div>
      ) : (
        <div
          className={`relative flex h-full flex-col justify-around gap-3 px-3 py-5 ${
            compact ? "min-h-0 origin-top scale-[0.78] sm:scale-[0.85]" : "min-h-[560px] gap-5 px-4 py-8 sm:px-8"
          }`}
        >
          {ROW_ORDER.map((group) => {
            const picks = squadByPosition[group];
            return (
              <div
                key={group}
                className="flex flex-wrap items-start justify-center gap-x-3 gap-y-3"
              >
                {picks.length === 0 ? (
                  <span className="rounded bg-black/20 px-2 py-1 text-[11px] text-white/60">
                    {ROW_LABELS[group]}
                  </span>
                ) : (
                  picks.map((pick) => (
                    <PlayerCard
                      key={pick.id}
                      pick={pick}
                      chem={chemistry?.get(pick.player.id)}
                      coachRating={coachRating}
                    />
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
