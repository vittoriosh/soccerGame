"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { barlow, bebas } from "@/lib/game-fonts";
import { clubLogoSrc } from "@/lib/player-image";
import { chooseTeam, rollPickOrder, beginDraft } from "@/app/draft/[id]/pick-team/actions";

export type ClubOption = {
  id: number;
  name: string;
  shortName: string;
  league: string;
  clubId: number | null;
};

function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <span
      ref={ref}
      className="relative inline-flex align-middle"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label="More info"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`${bebas.className} ml-3 inline-flex h-9 w-9 items-center justify-center border-2 border-white/55 bg-black/60 text-lg leading-none text-white transition hover:border-white hover:bg-white hover:text-black`}
      >
        i
      </button>
      {open && (
        <span
          role="tooltip"
          className={`${barlow.className} fixed inset-x-4 top-1/2 z-50 w-auto -translate-y-1/2 border border-white/30 bg-black px-4 py-3 text-left text-sm leading-snug font-medium text-white shadow-lg sm:absolute sm:inset-x-auto sm:top-full sm:left-1/2 sm:mt-3 sm:w-72 sm:-translate-x-1/2 sm:translate-y-0`}
        >
          {text}
        </span>
      )}
    </span>
  );
}

function ClubCrest({
  clubId,
  shortName,
  size = 56,
}: {
  clubId: number | null;
  shortName: string;
  size?: number;
}) {
  const src = clubLogoSrc(clubId, 90);
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" width={size} height={size} className="object-contain" />
    );
  }
  return (
    <span
      className={`${bebas.className} flex h-full w-full items-center justify-center text-2xl text-white/80`}
    >
      {shortName.slice(0, 1)}
    </span>
  );
}

export function PickClubFlow({
  draftId,
  clubs,
  chosenClub,
  revealedPick,
  teamCount,
}: {
  draftId: number;
  clubs: ClubOption[];
  chosenClub: ClubOption | null;
  revealedPick: number | null;
  teamCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const [rolling, setRolling] = useState(false);
  const [displayPick, setDisplayPick] = useState<number | null>(revealedPick);
  const [finalPick, setFinalPick] = useState<number | null>(revealedPick);
  const [error, setError] = useState<string | null>(null);

  const byLeague = new Map<string, ClubOption[]>();
  for (const club of clubs) {
    if (!byLeague.has(club.league)) byLeague.set(club.league, []);
    byLeague.get(club.league)!.push(club);
  }

  function selectClub(teamId: number) {
    const formData = new FormData();
    formData.set("draftId", String(draftId));
    formData.set("teamId", String(teamId));
    startTransition(() => {
      chooseTeam(formData);
    });
  }

  function onRoll() {
    if (rolling || finalPick !== null || pending) return;
    setError(null);
    setRolling(true);

    const formData = new FormData();
    formData.set("draftId", String(draftId));

    // Shuffle on the server immediately, keep spinning locally, then land
    // on THAT number. The old path spun randoms, froze on one, then swapped
    // to the real slot after a long wait — that's the last-second glitch.
    const resultPromise = rollPickOrder(formData);
    const started = Date.now();
    const minSpinMs = 1200;
    const spin = window.setInterval(() => {
      setDisplayPick((prev) => {
        if (teamCount <= 1) return 1;
        let next = 1 + Math.floor(Math.random() * teamCount);
        if (next === prev) next = (next % teamCount) + 1;
        return next;
      });
    }, 70);

    void resultPromise
      .then(async (result) => {
        const wait = minSpinMs - (Date.now() - started);
        if (wait > 0) await new Promise((resolve) => window.setTimeout(resolve, wait));
        window.clearInterval(spin);
        setDisplayPick(result.draftOrder);
        setFinalPick(result.draftOrder);
        setRolling(false);
      })
      .catch((err) => {
        window.clearInterval(spin);
        setRolling(false);
        setError(err instanceof Error ? err.message : "Roll failed");
      });
  }

  function onContinue() {
    const formData = new FormData();
    formData.set("draftId", String(draftId));
    startTransition(() => {
      beginDraft(formData);
    });
  }

  if (chosenClub) {
    const crest = (
      <div className="mx-auto flex h-24 w-24 items-center justify-center border-2 border-white/40 bg-black/50 p-2">
        <ClubCrest clubId={chosenClub.clubId} shortName={chosenClub.shortName} size={80} />
      </div>
    );

    return (
      <div className="flex w-full max-w-xl flex-col items-center text-center">
        <div className="home-fade-in w-full">
          <h1
            className={`${bebas.className} flex items-center justify-center text-4xl tracking-wide text-white sm:text-6xl`}
          >
            Draft Order
            <InfoTip text="Roll for a random snake-draft slot. Pick #1 goes first; later slots get better reverse-order turns." />
          </h1>

          <div className="mt-8">{crest}</div>
          <p className={`${bebas.className} mt-4 text-3xl tracking-wide text-white`}>
            {chosenClub.shortName}
          </p>

          <div className="mt-10 flex flex-col items-center">
            <div
              className={`${bebas.className} flex h-36 w-36 items-center justify-center border-2 border-white bg-black/55 text-7xl text-white ${
                rolling ? "pick-roll-spin" : ""
              }`}
            >
              {displayPick ?? "?"}
            </div>
            <p className={`${bebas.className} mt-3 text-lg tracking-[0.2em] text-white/70`}>
              {finalPick !== null ? `Pick #${finalPick}` : "Your pick"}
            </p>
          </div>
        </div>

        {error && <p className="mt-6 text-sm font-medium text-red-200">{error}</p>}

        <div className="mt-10">
          {finalPick === null ? (
            <button
              type="button"
              onClick={onRoll}
              disabled={rolling || pending}
              className={`${bebas.className} border-2 border-white bg-white px-12 py-5 text-3xl tracking-[0.12em] text-black transition hover:bg-transparent hover:text-white disabled:opacity-60`}
            >
              {rolling || pending ? "Rolling…" : "Roll for Pick"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onContinue}
              disabled={pending}
              className={`${bebas.className} border-2 border-white bg-white px-12 py-5 text-3xl tracking-[0.12em] text-black transition hover:bg-transparent hover:text-white disabled:opacity-60`}
            >
              {pending ? "Starting…" : "Continue →"}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-5xl flex-col items-center text-center">
      <div className="home-fade-in w-full">
        <h1
          className={`${bebas.className} flex items-center justify-center text-4xl tracking-wide text-white sm:text-6xl`}
        >
          Choose Your Club
          <InfoTip text="Pick the club you'll manage. Draft order is rolled randomly on the next screen." />
        </h1>

        {Array.from(byLeague.entries()).map(([league, leagueClubs]) => (
          <div key={league} className="mt-8">
            {byLeague.size > 1 && (
              <h2 className={`${bebas.className} mb-4 text-xl tracking-[0.2em] text-white/70`}>
                {league}
              </h2>
            )}
            <div className="grid max-h-[58vh] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-4 md:grid-cols-5">
              {leagueClubs.map((club) => (
                <button
                  key={club.id}
                  type="button"
                  disabled={pending}
                  onClick={() => selectClub(club.id)}
                  className="flex flex-col items-center gap-3 border-2 border-white/35 bg-black/50 px-3 py-4 transition hover:border-white hover:bg-black/70 disabled:opacity-50"
                >
                  <div className="flex h-14 w-14 items-center justify-center">
                    <ClubCrest clubId={club.clubId} shortName={club.shortName} />
                  </div>
                  <span className={`${bebas.className} text-lg leading-tight tracking-wide text-white`}>
                    {club.shortName}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
