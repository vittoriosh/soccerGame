"use client";

import { useRouter } from "next/navigation";

export function DraftFilters({
  draftId,
  slot,
  initialQuery,
  initialLeague,
  initialSort,
  naturalOnly,
  leagueOptions,
  canFilterFit,
  canSortPotential = true,
}: {
  draftId: number;
  slot?: string;
  initialQuery: string;
  initialLeague: string;
  initialSort: string;
  naturalOnly: boolean;
  leagueOptions: string[];
  /** Hidden for the bench and the coach board, where "natural" is
   *  meaningless — there's no slot to fit. */
  canFilterFit: boolean;
  canSortPotential?: boolean;
}) {
  const router = useRouter();

  function navigate(overrides: {
    q?: string;
    league?: string;
    sort?: string;
    fit?: string;
  }) {
    const search = new URLSearchParams();
    if (slot) search.set("slot", slot);
    const q = overrides.q ?? initialQuery;
    const league = overrides.league ?? initialLeague;
    const sort = overrides.sort ?? initialSort;
    const fit = overrides.fit ?? (naturalOnly ? "natural" : "");
    if (q) search.set("q", q);
    if (league) search.set("league", league);
    if (sort) search.set("sort", sort);
    if (fit) search.set("fit", fit);
    const qs = search.toString();
    router.push(`/draft/${draftId}${qs ? `?${qs}` : ""}`);
  }

  const field =
    "h-9 border-0 border-b border-white/20 bg-transparent px-0 text-sm text-white outline-none placeholder:text-white/35 focus:border-white";

  return (
    <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-1">
      <form
        className="w-full min-w-0 sm:flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          const value = new FormData(e.currentTarget).get("q");
          navigate({ q: String(value ?? "") });
        }}
      >
        <input
          type="search"
          name="q"
          defaultValue={initialQuery}
          placeholder="Search"
          className={`w-full ${field}`}
        />
      </form>
      {canFilterFit && (
        <button
          type="button"
          onClick={() => navigate({ fit: naturalOnly ? "" : "natural" })}
          aria-pressed={naturalOnly}
          title="Only players whose real position is this slot"
          className={`h-9 shrink-0 border-b px-2 text-xs tracking-[0.12em] uppercase transition ${
            naturalOnly
              ? "border-white text-white"
              : "border-white/20 text-white/40 hover:text-white"
          }`}
        >
          Natural
        </button>
      )}
      {leagueOptions.length > 1 && (
        <select
          defaultValue={initialLeague}
          onChange={(e) => navigate({ league: e.target.value })}
          className={`${field} max-w-[7.5rem] shrink-0`}
        >
          <option value="" className="bg-black text-white">
            League
          </option>
          {leagueOptions.map((l) => (
            <option key={l} value={l} className="bg-black text-white">
              {l}
            </option>
          ))}
        </select>
      )}
      {canSortPotential && (
      <select
        defaultValue={initialSort}
        onChange={(e) => navigate({ sort: e.target.value })}
        className={`${field} w-[4.5rem] shrink-0`}
        aria-label="Sort"
      >
        <option value="" className="bg-black text-white">
          OVR
        </option>
        <option value="potential_desc" className="bg-black text-white">
          POT
        </option>
      </select>
      )}
    </div>
  );
}
