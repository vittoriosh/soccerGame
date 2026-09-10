import { groupLabel, POSITION_GROUPS, type PositionGroup } from "@/lib/positions";
import type { LineBreakdown } from "@/lib/team-rating";

function impactColor(chem: number) {
  if (chem > 0.05) return "text-emerald-400";
  if (chem < -0.05) return "text-red-400";
  return "text-white/50";
}

function formatImpact(impact: number) {
  const rounded = Math.round(impact * 10) / 10;
  if (rounded === 0) return "±0.0";
  return rounded > 0 ? `+${rounded.toFixed(1)}` : rounded.toFixed(1);
}

export function RatingBreakdown({
  lines,
  leagueLineAverages,
  coachRating,
  leagueCoachAverage,
  coachWeight,
  chemCoachSwing,
  experienceDelta,
  experienceLabel,
}: {
  lines: LineBreakdown[];
  leagueLineAverages: Record<PositionGroup, number>;
  coachRating: number | undefined;
  leagueCoachAverage: number;
  coachWeight: number;
  chemCoachSwing: number;
  experienceDelta: number;
  experienceLabel: string;
}) {
  const rows: { key: string; label: string; yours: number; leagueAvg: number; impact: number }[] =
    POSITION_GROUPS.map((group) => {
      const line = lines.find((l) => l.group === group);
      const yours = line?.effectiveAvg ?? 0;
      const leagueAvg = leagueLineAverages[group] ?? 0;
      const impact = (yours - leagueAvg) * (line?.weight ?? 0);
      return { key: group, label: groupLabel(group), yours, leagueAvg, impact };
    });

  const coachImpact = ((coachRating ?? 0) - leagueCoachAverage) * coachWeight;
  rows.push({
    key: "COACH",
    label: "Coach",
    yours: coachRating ?? 0,
    leagueAvg: leagueCoachAverage,
    impact: coachImpact,
  });

  return (
    <div>
      <h3 className="text-sm font-semibold text-white/80">Rating breakdown</h3>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[380px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/20 text-xs text-white/50">
              <th className="py-1.5 pr-4 font-medium">Slot</th>
              <th className="py-1.5 pr-4 font-medium">You</th>
              <th className="py-1.5 pr-4 font-medium">League</th>
              <th className="py-1.5 pr-4 font-medium">Impact</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-white/10">
                <td className="py-1.5 pr-4 text-white/85">{row.label}</td>
                <td className="py-1.5 pr-4 font-semibold text-white">
                  {row.key === "COACH" && !coachRating ? "—" : row.yours.toFixed(1)}
                </td>
                <td className="py-1.5 pr-4 text-white/55">{row.leagueAvg.toFixed(1)}</td>
                <td className={`py-1.5 pr-4 font-semibold ${impactColor(row.impact)}`}>
                  {formatImpact(row.impact)}
                </td>
              </tr>
            ))}
            <tr className="border-b border-white/10">
              <td className="py-1.5 pr-4 text-white/85">Chem / coach</td>
              <td className="py-1.5 pr-4 text-white/40" colSpan={2} />
              <td className={`py-1.5 pr-4 font-semibold ${impactColor(chemCoachSwing)}`}>
                {formatImpact(chemCoachSwing)}
              </td>
            </tr>
            <tr>
              <td className="py-1.5 pr-4 text-white/85">Age balance</td>
              <td className="py-1.5 pr-4 text-white/40" colSpan={2}>
                {experienceLabel}
              </td>
              <td className={`py-1.5 pr-4 font-semibold ${impactColor(experienceDelta)}`}>
                {formatImpact(experienceDelta)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
