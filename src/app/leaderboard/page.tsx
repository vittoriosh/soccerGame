import Link from "next/link";
import { prisma } from "@/lib/db";
import { StadiumShell } from "@/components/stadium-shell";
import { barlow, bebas } from "@/lib/game-fonts";

export const dynamic = "force-dynamic";

const CAREER_MODES = [
  { key: "career", label: "Career 7s" },
  { key: "career11", label: "Career 11s" },
] as const;

function modeLabel(mode: string): string {
  return CAREER_MODES.find((entry) => entry.key === mode)?.label ?? "Career 7s";
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; division?: string; returnTo?: string }>;
}) {
  const query = await searchParams;
  const mode = query.mode === "career11" ? "career11" : "career";
  const parsedDivision = Number.parseInt(query.division ?? "5", 10);
  const division = Math.max(1, Math.min(10, Number.isFinite(parsedDivision) ? parsedDivision : 5));
  // Only accept a local draft result route; never turn this into an open redirect.
  const returnTo = /^\/draft\/\d+$/.test(query.returnTo ?? "") ? query.returnTo! : null;
  const returnQuery = returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : "";

  const [divisionRows, allResults] = await Promise.all([
    prisma.careerResult.findMany({
      where: { gameMode: mode, division },
      orderBy: [{ teamScore: "desc" }, { fieldRank: "asc" }, { createdAt: "asc" }],
      take: 100,
    }),
    prisma.careerResult.findMany({
      where: { gameMode: mode },
      orderBy: [{ careerKey: "asc" }, { seasonNumber: "asc" }],
    }),
  ]);

  const byCareer = new Map<string, typeof allResults>();
  for (const result of allResults) {
    const career = byCareer.get(result.careerKey) ?? [];
    career.push(result);
    byCareer.set(result.careerKey, career);
  }
  const divisionOne = [...byCareer.values()]
    .map((results) => {
      const reached = results.find((result) => result.division === 1);
      if (!reached) return null;
      const journey = results.filter((result) => result.seasonNumber <= reached.seasonNumber);
      return {
        careerKey: reached.careerKey,
        username: reached.username,
        teamName: reached.teamName,
        seasonsToDivisionOne: reached.seasonNumber,
        averageScore:
          journey.reduce((sum, result) => sum + result.teamScore, 0) / Math.max(1, journey.length),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort(
      (a, b) =>
        a.seasonsToDivisionOne - b.seasonsToDivisionOne ||
        b.averageScore - a.averageScore,
    )
    .slice(0, 50);

  return (
    <StadiumShell scrollable>
      <main className={`${barlow.className} mx-auto w-full max-w-5xl pb-12 text-white`}>
        <div className="mb-6 flex justify-start">
          <Link
            href={returnTo ?? "/"}
            className={`${bebas.className} border-2 border-white/60 bg-black/50 px-5 py-3 text-xl tracking-[0.12em] text-white transition hover:border-white`}
          >
            ← {returnTo ? "Back to career" : "Menu"}
          </Link>
        </div>
        <div className="text-center">
          <p className={`${bebas.className} text-sm tracking-[0.35em] text-emerald-300`}>
            Global Rankings
          </p>
          <h1 className={`${bebas.className} mt-2 text-5xl tracking-wide sm:text-7xl`}>
            Career Leaderboard
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-white/55">
            Every completed season records the manager, club, score and finish.
          </p>
        </div>

        <nav className="mx-auto mt-8 grid max-w-md grid-cols-2 gap-2">
          {CAREER_MODES.map((entry) => (
            <Link
              key={entry.key}
              href={`/leaderboard?mode=${entry.key}&division=${division}${returnQuery}`}
              className={`${bebas.className} border-2 px-4 py-3 text-center text-xl tracking-[0.12em] ${
                mode === entry.key
                  ? "border-white bg-white text-black"
                  : "border-white/35 bg-black/50 text-white"
              }`}
            >
              {entry.label}
            </Link>
          ))}
        </nav>

        <section className="mt-10">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <h2 className={`${bebas.className} text-3xl tracking-wide`}>
              {modeLabel(mode)} · Division {division}
            </h2>
            <div className="flex max-w-full gap-1 overflow-x-auto pb-1">
              {Array.from({ length: 10 }, (_, index) => index + 1).map((number) => (
                <Link
                  key={number}
                  href={`/leaderboard?mode=${mode}&division=${number}${returnQuery}`}
                  className={`${bebas.className} flex h-9 w-9 shrink-0 items-center justify-center border text-lg ${
                    division === number
                      ? "border-white bg-white text-black"
                      : "border-white/30 bg-black/50 text-white/70"
                  }`}
                >
                  {number}
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-4 overflow-hidden border-2 border-white/25 bg-black/50">
            <div className="grid grid-cols-[2.5rem_1fr_4rem] gap-3 border-b border-white/15 px-3 py-2 text-[10px] tracking-[0.15em] text-white/45 uppercase sm:grid-cols-[3rem_1.2fr_1fr_6rem_5rem]">
              <span>#</span>
              <span>Manager</span>
              <span className="hidden sm:block">Club</span>
              <span className="hidden text-center sm:block">Finish</span>
              <span className="text-right">Score</span>
            </div>
            {divisionRows.length === 0 ? (
              <p className="px-5 py-12 text-center text-sm text-white/45">
                No completed seasons in this division yet.
              </p>
            ) : (
              divisionRows.map((row, index) => (
                <div
                  key={row.id}
                  className="grid grid-cols-[2.5rem_1fr_4rem] items-center gap-3 border-b border-white/10 px-3 py-3 last:border-0 sm:grid-cols-[3rem_1.2fr_1fr_6rem_5rem]"
                >
                  <span className={`${bebas.className} text-xl text-white/40`}>{index + 1}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{row.username}</span>
                    <span className="block truncate text-xs text-white/40 sm:hidden">
                      {row.teamName} · {row.fieldRank}/{row.fieldSize}
                    </span>
                  </span>
                  <span className="hidden truncate text-sm text-white/65 sm:block">{row.teamName}</span>
                  <span className="hidden text-center text-sm text-white/65 sm:block">
                    {row.fieldRank}/{row.fieldSize}
                  </span>
                  <span className={`${bebas.className} text-right text-2xl text-emerald-300`}>
                    {row.teamScore.toFixed(1)}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="mt-12">
          <h2 className={`${bebas.className} text-3xl tracking-wide`}>Division 1 Journeys</h2>
          <p className="mt-1 text-sm text-white/45">
            Ranked by fewest seasons to reach Division 1, then highest journey average.
          </p>
          <div className="mt-4 overflow-hidden border-2 border-white/25 bg-black/50">
            {divisionOne.length === 0 ? (
              <p className="px-5 py-12 text-center text-sm text-white/45">
                Nobody has reached Division 1 yet.
              </p>
            ) : (
              divisionOne.map((row, index) => (
                <div
                  key={row.careerKey}
                  className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 border-b border-white/10 px-3 py-3 last:border-0 sm:grid-cols-[3rem_1fr_1fr_8rem_8rem]"
                >
                  <span className={`${bebas.className} text-xl text-white/40`}>{index + 1}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{row.username}</span>
                    <span className="block truncate text-xs text-white/40 sm:hidden">{row.teamName}</span>
                  </span>
                  <span className="hidden truncate text-sm text-white/65 sm:block">{row.teamName}</span>
                  <span className="hidden text-right text-sm text-white/65 sm:block">
                    {row.seasonsToDivisionOne} seasons
                  </span>
                  <span className={`${bebas.className} text-right text-xl text-emerald-300`}>
                    <span className="sm:hidden">{row.seasonsToDivisionOne}S · </span>
                    {row.averageScore.toFixed(1)} avg
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        <div className="mt-10 text-center">
          <Link
            href={returnTo ?? "/draft"}
            className={`${bebas.className} inline-flex border-2 border-white bg-white px-10 py-4 text-2xl tracking-[0.12em] text-black`}
          >
            {returnTo ? "Back to Career →" : "Play Career →"}
          </Link>
        </div>
      </main>
    </StadiumShell>
  );
}
