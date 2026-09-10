import { bebas } from "@/lib/game-fonts";
import type { PositionGroup } from "@/lib/positions";
import type { LineBreakdown } from "@/lib/team-rating";
import { DEFAULT_SCORING_RULES, type ScoringRules } from "@/lib/scoring-rules";

/** Attack-first order matches the end-of-draft reveal — managers read a
 *  team from front to back, so the live strip does the same. */
const LINE_ORDER: { group: PositionGroup; label: string }[] = [
  { group: "FWD", label: "ATT" },
  { group: "MID", label: "MID" },
  { group: "DEF", label: "DEF" },
  { group: "GK", label: "GK" },
];

function tone(value: number, neutralBand = 0.05) {
  if (value > neutralBand) return "text-emerald-300";
  if (value < -neutralBand) return "text-amber-300";
  return "text-white/70";
}

function signed(value: number) {
  const n = Math.round(value * 10) / 10;
  if (n === 0) return "±0.0";
  return n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1);
}

/**
 * The live readout of everything that actually moves the final rating —
 * not just the headline number. Sat during the draft so you can see *why*
 * a pick helped or hurt before the board closes.
 *
 * Chemistry's neutral is 8 in formation mode (natural XI, one league, no
 * stacking). Anything above that is earned; below it is bleeding.
 */
export function DraftLiveFactors({
  lines,
  chemistry,
  chemCoachSwing,
  fitCost,
  naturalStarters,
  filledSlots,
  experienceLabel,
  experienceDelta,
  coachRating,
  coachName,
  rules = DEFAULT_SCORING_RULES,
}: {
  lines: LineBreakdown[];
  chemistry: number;
  chemCoachSwing: number;
  fitCost: number;
  naturalStarters: number;
  filledSlots: number;
  experienceLabel: string;
  experienceDelta: number;
  coachRating: number | undefined;
  coachName: string | null;
  rules?: ScoringRules;
}) {
  const byGroup = new Map(lines.map((l) => [l.group, l]));
  // Empty lines still show as a dash so the strip never collapses mid-draft
  // when you haven't filled a whole area yet.
  const lineTiles = LINE_ORDER.map(({ group, label }) => {
    const line = byGroup.get(group);
    const hasPlayers = (line?.effectiveAvg ?? 0) > 0 || (line?.rawAvg ?? 0) > 0;
    return {
      group,
      label,
      value: hasPlayers ? line!.effectiveAvg : null,
    };
  });

  const factors: { key: string; label: string; value: string; className: string; title: string }[] =
    [];
  if (rules.chemistry) {
    factors.push(
      {
        key: "chem",
        label: "Chem",
        value: chemistry.toFixed(1),
        className: chemistry >= 8 ? "text-emerald-300" : chemistry >= 6 ? "text-amber-300" : "text-red-400",
        title: "8 is neutral for a natural one-league XI. Above earns potential; below costs it.",
      },
      {
        key: "swing",
        label: "Chem swing",
        value: signed(chemCoachSwing),
        className: tone(chemCoachSwing),
        title: "How much chemistry + coach are adding or taking off raw ability.",
      },
    );
  }
  if (rules.fit) {
    factors.push(
      {
        key: "fit",
        label: "Fit",
        value: fitCost === 0 ? "±0.0" : signed(fitCost),
        className: tone(fitCost),
        title: "Rating lost to players standing out of their natural position.",
      },
      {
        key: "natural",
        label: "Natural",
        value: `${naturalStarters}/11`,
        className:
          filledSlots === 0
            ? "text-white/50"
            : naturalStarters === filledSlots && filledSlots >= 11
              ? "text-emerald-300"
              : naturalStarters / Math.max(filledSlots, 1) >= 0.7
                ? "text-white"
                : "text-amber-300",
        title: "Starters in a natural or comfortable role out of eleven. Misplaced players cost rating and chemistry.",
      },
    );
  }
  if (rules.age) {
    factors.push({
      key: "age",
      label: "Age",
      value:
        experienceDelta === 0
          ? experienceLabel
          : `${experienceLabel} ${signed(experienceDelta)}`,
      className: tone(experienceDelta),
      title: "Lopsided youth or veterans tax the rating. A mixed squad costs nothing.",
    });
  }
  if (rules.coach) {
    factors.push({
      key: "coach",
      label: "Coach",
      value: coachRating != null ? String(coachRating) : "—",
      className: coachRating != null ? "text-white" : "text-white/40",
      title: coachName
        ? `${coachName} — 8% of rating, plus a squad-wide chemistry and development boost.`
        : "Still open. Coaches are 8% of rating and lift every player you own.",
    });
  }

  return (
    <div className="shrink-0 space-y-2">
      <div className="grid grid-cols-4 gap-1.5">
        {lineTiles.map((tile) => (
          <div
            key={tile.group}
            className="border border-white/20 bg-black/45 px-2 py-2 text-center"
            title={`${tile.label} line — effective average across your filled slots`}
          >
            <div className="text-[9px] tracking-[0.16em] text-white/45 uppercase">{tile.label}</div>
            <div className={`${bebas.className} mt-0.5 text-2xl leading-none text-white`}>
              {tile.value != null ? tile.value.toFixed(1) : "—"}
            </div>
          </div>
        ))}
      </div>

      {factors.length > 0 && (
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 border border-white/15 bg-black/40 px-3 py-2.5 sm:grid-cols-3">
        {factors.map((f) => (
          <div key={f.key} title={f.title} className="min-w-0">
            <dt className="truncate text-[9px] tracking-[0.14em] text-white/40 uppercase">
              {f.label}
            </dt>
            <dd className={`${bebas.className} truncate text-lg leading-tight tracking-wide ${f.className}`}>
              {f.value}
            </dd>
          </div>
        ))}
      </dl>
      )}
    </div>
  );
}
