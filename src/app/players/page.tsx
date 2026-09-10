import Link from "next/link";
import { prisma } from "@/lib/db";
import { playerImageSrc, clubLogoSrc } from "@/lib/player-image";
import { flagUrl } from "@/lib/country-flags";
import { cardTierAccentBorderClass } from "@/lib/card-tier";
import { StadiumShell } from "@/components/stadium-shell";
import { bebas } from "@/lib/game-fonts";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

function buildQueryString(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q = "", page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);

  const where = q ? { name: { contains: q } } : {};

  const [players, total] = await Promise.all([
    prisma.player.findMany({
      where,
      orderBy: { overall: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.player.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <StadiumShell scrollable>
      <main className="mx-auto flex w-full max-w-4xl flex-col pb-10">
        <div className="flex shrink-0 items-end justify-between gap-4">
          <div>
            <p className={`${bebas.className} text-sm tracking-[0.35em] text-white/55`}>Database</p>
            <h1 className={`${bebas.className} mt-1 text-5xl tracking-wide text-white`}>Players</h1>
            <p className="mt-1 text-sm text-white/50">{total.toLocaleString()} cards</p>
          </div>
          <Link
            href="/"
            className={`${bebas.className} border border-white/40 bg-black/40 px-5 py-2.5 text-lg tracking-wide text-white transition hover:border-white hover:bg-white hover:text-black`}
          >
            Menu
          </Link>
        </div>

        <form className="mt-8 flex items-end gap-3" action="/players">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search"
            className="h-11 min-w-0 flex-1 border-0 border-b border-white/25 bg-transparent px-0 text-base text-white outline-none placeholder:text-white/35 focus:border-white"
          />
          <button
            type="submit"
            className={`${bebas.className} h-11 border-2 border-white bg-white px-6 text-xl tracking-[0.12em] text-black transition hover:bg-transparent hover:text-white`}
          >
            Search
          </button>
        </form>

        <ul className="mt-6 bg-black/50 backdrop-blur-sm">
          {players.map((player) => {
            const tierRing = cardTierAccentBorderClass(player.overall, "border-white/20");
            return (
              <li key={player.id}>
                <Link
                  href={`/players/${player.id}`}
                  className="flex items-center gap-3 px-3 py-2.5 transition hover:bg-white/5"
                >
                  <span className="w-8 shrink-0 text-right text-sm font-black text-white">
                    {player.overall}
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={playerImageSrc(player.imageUrl)}
                    alt=""
                    width={36}
                    height={36}
                    className={`h-9 w-9 shrink-0 rounded-full border object-cover ${tierRing}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-white">{player.name}</div>
                    <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-tight text-white/55">
                      <span className="font-medium text-white/75">{player.positions}</span>
                      <span className="text-white/25">·</span>
                      <span className="inline-flex min-w-0 items-center gap-1">
                        {clubLogoSrc(player.clubId, 30) && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={clubLogoSrc(player.clubId, 30)!}
                            alt=""
                            width={12}
                            height={12}
                            className="h-3 w-3 shrink-0 object-contain"
                          />
                        )}
                        <span className="truncate">{player.club || "Free agent"}</span>
                      </span>
                      <span className="text-white/25">·</span>
                      <span className="truncate">{player.league}</span>
                      <span className="text-white/25">·</span>
                      <span className="inline-flex min-w-0 items-center gap-1">
                        {flagUrl(player.nationality) && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={flagUrl(player.nationality)!}
                            alt=""
                            width={12}
                            height={8}
                            className="h-2.5 w-3.5 shrink-0 object-cover"
                          />
                        )}
                        <span className="truncate">{player.nationality}</span>
                      </span>
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] text-white/35">POT {player.potential}</span>
                </Link>
              </li>
            );
          })}
          {players.length === 0 && (
            <li className="px-4 py-12 text-center text-sm text-white/40">
              No players match “{q}”.
            </li>
          )}
        </ul>

        <div className="mt-6 flex items-center justify-between gap-3">
          <Link
            href={`/players${buildQueryString({ q, page: page > 1 ? page - 1 : undefined })}`}
            aria-label="Previous page"
            aria-disabled={page <= 1}
            className={`${bebas.className} flex h-11 min-w-11 items-center justify-center border border-white/35 bg-black/40 px-3 text-3xl leading-none text-white transition hover:border-white hover:bg-white hover:text-black ${
              page <= 1 ? "pointer-events-none opacity-25" : ""
            }`}
          >
            ‹
          </Link>
          <span className={`${bebas.className} text-lg tracking-[0.16em] text-white/70`}>
            {page} / {totalPages}
          </span>
          <Link
            href={`/players${buildQueryString({ q, page: page + 1 })}`}
            aria-label="Next page"
            aria-disabled={page >= totalPages}
            className={`${bebas.className} flex h-11 min-w-11 items-center justify-center border border-white/35 bg-black/40 px-3 text-3xl leading-none text-white transition hover:border-white hover:bg-white hover:text-black ${
              page >= totalPages ? "pointer-events-none opacity-25" : ""
            }`}
          >
            ›
          </Link>
        </div>
      </main>
    </StadiumShell>
  );
}
