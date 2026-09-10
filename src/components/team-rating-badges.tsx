function chemColor(chem: number) {
  if (chem >= 9) return "text-emerald-400";
  if (chem >= 7) return "text-amber-300";
  return "text-red-400";
}

export function TeamRatingSummary({
  rating,
  pureAverage,
  chemistry,
  coachRating,
  experienceLabel,
  experienceDelta,
  hasSquad,
}: {
  rating: number;
  pureAverage: number;
  chemistry: number;
  coachRating: number | undefined;
  experienceLabel: string;
  experienceDelta: number;
  hasSquad: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="border-2 border-white bg-black/50 px-5 py-3">
        <div className="text-xs tracking-wide text-white/55">Team Rating</div>
        <div className="text-4xl font-black leading-none text-white">
          {hasSquad ? rating.toFixed(1) : "—"}
        </div>
      </div>
      {hasSquad && (
        <div className="border border-white/30 bg-black/40 px-4 py-3">
          <div className="text-xs tracking-wide text-white/55">Pure Avg</div>
          <div className="text-2xl font-bold leading-none text-white/85">
            {pureAverage.toFixed(1)}
          </div>
        </div>
      )}
      {hasSquad && (
        <dl className="grid grid-cols-3 gap-x-4 gap-y-0.5 pb-1 text-xs">
          <dt className="text-white/45">Chemistry</dt>
          <dt className="text-white/45">Coach</dt>
          <dt className="text-white/45">XP</dt>
          <dd className={`font-semibold ${chemColor(chemistry)}`}>
            {chemistry.toFixed(1)}
          </dd>
          <dd className="font-semibold text-white">{coachRating ?? "—"}</dd>
          <dd
            className={`font-semibold ${experienceDelta < 0 ? "text-red-400" : "text-white"}`}
          >
            {experienceLabel}
            {experienceDelta !== 0 ? ` (${experienceDelta})` : ""}
          </dd>
        </dl>
      )}
    </div>
  );
}
