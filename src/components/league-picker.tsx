"use client";

import { useRef } from "react";

export function LeaguePicker({
  topLeagues,
  otherLeagues,
  defaultChecked,
  teamsPerLeagueDefault,
  maxTeamsPerLeague,
}: {
  topLeagues: string[];
  otherLeagues: string[];
  defaultChecked: string;
  teamsPerLeagueDefault: number;
  maxTeamsPerLeague: number;
}) {
  const topRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const containerRef = useRef<HTMLDivElement | null>(null);
  const totalTeamsRef = useRef<HTMLInputElement | null>(null);
  const totalTeamsEditedByUser = useRef(false);

  // Keeps "Number of teams" tracking `teamsPerLeagueDefault` per league
  // checked, so leaving it untouched behaves like it always has — pick 5
  // leagues, get 20 real/full-size leagues, not a total quietly split 5
  // ways into 4-team leagues. Once the user types into the field directly,
  // their number wins and stops auto-following league selection.
  function syncTotalTeamsDefault() {
    if (totalTeamsEditedByUser.current) return;
    const container = containerRef.current;
    const input = totalTeamsRef.current;
    if (!container || !input) return;
    const checkedCount = container.querySelectorAll("input[type=checkbox]:checked").length;
    input.value = String(Math.max(1, checkedCount) * teamsPerLeagueDefault);
  }

  function selectTop5() {
    for (const league of topLeagues) {
      const el = topRefs.current[league];
      if (el) el.checked = true;
    }
    syncTotalTeamsDefault();
  }

  return (
    <div
      ref={containerRef}
      onChange={(e) => {
        if ((e.target as HTMLElement).matches("input[type=checkbox]")) syncTotalTeamsDefault();
      }}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-black/70 dark:text-white/70">
          Top 5 leagues
        </h2>
        <button
          type="button"
          onClick={selectTop5}
          className="rounded-md border border-black/15 px-3 py-1 text-xs font-medium hover:bg-black/[0.03] dark:border-white/20 dark:hover:bg-white/[0.05]"
        >
          Top 5
        </button>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {topLeagues.map((league) => (
          <label
            key={league}
            className="flex items-center gap-2 rounded-lg border border-black/10 px-3 py-2.5 text-sm hover:bg-black/[0.03] dark:border-white/15 dark:hover:bg-white/[0.05]"
          >
            <input
              type="checkbox"
              name="leagues"
              value={league}
              defaultChecked={league === defaultChecked}
              ref={(el) => {
                topRefs.current[league] = el;
              }}
              className="h-4 w-4 shrink-0"
            />
            {league}
            {league === defaultChecked && (
              <span className="ml-auto text-xs text-black/40 dark:text-white/40">
                real data
              </span>
            )}
          </label>
        ))}
      </div>

      {otherLeagues.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-black/60 hover:text-foreground dark:text-white/60">
            More leagues ({otherLeagues.length})
          </summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {otherLeagues.map((league) => (
              <label
                key={league}
                className="flex items-center gap-2 rounded-lg border border-black/10 px-3 py-2.5 text-sm hover:bg-black/[0.03] dark:border-white/15 dark:hover:bg-white/[0.05]"
              >
                <input type="checkbox" name="leagues" value={league} className="h-4 w-4 shrink-0" />
                {league}
              </label>
            ))}
          </div>
        </details>
      )}

      <div className="mt-6">
        <label className="text-sm font-medium">
          Number of teams
          <input
            type="number"
            name="totalTeams"
            min={2}
            max={maxTeamsPerLeague * 10}
            defaultValue={teamsPerLeagueDefault}
            ref={totalTeamsRef}
            onChange={() => {
              totalTeamsEditedByUser.current = true;
            }}
            className="ml-3 w-20 rounded-md border border-black/15 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/40"
          />
        </label>
        <p className="mt-1 text-xs text-black/50 dark:text-white/50">
          The total field you&apos;ll compete against, split evenly across every league you pick
          — capped at {maxTeamsPerLeague} teams per league. Tracks {teamsPerLeagueDefault} per
          league picked until you type your own number. Every league&apos;s full coach roster is
          always available to draft, even with fewer teams competing.
        </p>
      </div>
    </div>
  );
}
