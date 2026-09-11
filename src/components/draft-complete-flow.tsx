"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { bebas, barlow } from "@/lib/game-fonts";
import { SlotPitch, type SlotOccupant } from "@/components/slot-pitch";
import { getFormation, type Formation } from "@/lib/formations";
import type { PositionGroup } from "@/lib/positions";
import { DEFAULT_SCORING_RULES, type ScoringRules } from "@/lib/scoring-rules";
import { startNextSeason } from "@/app/draft/[id]/actions";

type Step = "squad" | "lines" | "hindsight" | "result";

/** Attack first, then midfield, defence, keeper — the order a manager
 *  reads a team, and the order these screens reveal. */
const LINE_REVEAL: { group: PositionGroup; label: string }[] = [
  { group: "FWD", label: "Attack" },
  { group: "MID", label: "Midfield" },
  { group: "DEF", label: "Defence" },
  { group: "GK", label: "Keeper" },
];

export type CompleteLine = {
  group: PositionGroup;
  yours: number;
  leagueAvg: number;
  rank: number;
  fieldSize: number;
};

export type CompleteTeam = {
  teamId: number;
  shortName: string;
  formation: string;
  rating: number;
  chemistry: number;
  coachName: string | null;
  coachRating: number | null;
  isYou: boolean;
  occupants: { slotId: string; player: SlotOccupant }[];
};

export type Hindsight = {
  rating: number;
  coachName: string | null;
  coachRating: number | null;
  occupants: { slotId: string; player: SlotOccupant }[];
};

function formatSigned(value: number) {
  const n = Math.round(value * 10) / 10;
  if (n === 0) return "±0.0";
  return n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1);
}

function diffTone(value: number) {
  if (value > 0.05) return "text-emerald-300";
  if (value < -0.05) return "text-amber-300";
  return "text-white/70";
}

export function DraftCompleteFlow({
  clubName,
  formationKey,
  rank,
  rating,
  chemistry,
  naturalStarters,
  starterCount = 11,
  fitCost,
  occupants = [],
  lines = [],
  teams = [],
  hindsight = null,
  rules = DEFAULT_SCORING_RULES,
  draftId,
  leaderboardHref,
  season = null,
}: {
  clubName: string;
  formationKey: string;
  rank: number;
  rating: number;
  chemistry: number;
  naturalStarters: number;
  starterCount?: number;
  fitCost: number;
  occupants?: { slotId: string; player: SlotOccupant }[];
  lines?: CompleteLine[];
  teams?: CompleteTeam[];
  hindsight?: Hindsight | null;
  rules?: ScoringRules;
  draftId: number;
  leaderboardHref?: string;
  season?: {
    number: number;
    division: number;
    outcomeLabel: string;
    movement: "promoted" | "relegated" | "held";
    promotionMaxRank: number;
    relegationMinRank: number;
  } | null;
}) {
  const [step, setStep] = useState<Step>("squad");
  const [lineIndex, setLineIndex] = useState(0);
  const [viewTeamId, setViewTeamId] = useState<number | null>(null);
  const [seasonPending, startSeasonTransition] = useTransition();

  const formation: Formation = getFormation(formationKey);
  const occupantMap = new Map(occupants.map((o) => [o.slotId, o.player]));
  const fieldSize = teams.length;

  const lineByGroup = new Map(lines.map((l) => [l.group, l]));
  const currentLineMeta = LINE_REVEAL[lineIndex] ?? LINE_REVEAL[0];
  const currentLine = lineByGroup.get(currentLineMeta.group);

  const viewedTeam = teams.find((t) => t.teamId === viewTeamId) ?? null;

  function playNextSeason() {
    const formData = new FormData();
    formData.set("draftId", String(draftId));
    startSeasonTransition(() => {
      startNextSeason(formData);
    });
  }

  function goNext() {
    if (step === "squad") {
      setStep("lines");
      setLineIndex(0);
      return;
    }
    if (step === "lines") {
      if (lineIndex < LINE_REVEAL.length - 1) {
        setLineIndex((i) => i + 1);
        return;
      }
      setStep(hindsight ? "hindsight" : "result");
      return;
    }
    if (step === "hindsight") setStep("result");
  }

  function goBack() {
    if (step === "result") {
      setStep(hindsight ? "hindsight" : "lines");
      setLineIndex(LINE_REVEAL.length - 1);
      return;
    }
    if (step === "hindsight") {
      setStep("lines");
      setLineIndex(LINE_REVEAL.length - 1);
      return;
    }
    if (step === "lines") {
      if (lineIndex > 0) {
        setLineIndex((i) => i - 1);
        return;
      }
      setStep("squad");
    }
  }

  const continueLabel =
    step === "squad"
      ? "See rankings →"
      : step === "lines" && lineIndex < LINE_REVEAL.length - 1
        ? "Next →"
        : step === "lines"
          ? hindsight
            ? "Perfect draft →"
            : "Final result →"
          : step === "hindsight"
            ? "Final result →"
            : null;

  // Viewing a rival squad takes over the screen entirely — it's the same
  // pitch, just someone else's, so it needs the same room.
  const frameClass = `${barlow.className} mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-4xl flex-col text-center`;
  const scrollerClass =
    "flex w-full flex-1 flex-col touch-pan-y";
  const actionsClass =
    "flex shrink-0 flex-wrap items-center justify-center gap-3 px-1 pt-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:gap-4";
  const primaryBtn = `${bebas.className} min-h-12 border-2 border-white bg-white px-8 py-3 text-2xl tracking-[0.12em] text-black transition hover:bg-transparent hover:text-white sm:min-h-14 sm:px-12 sm:py-5 sm:text-3xl`;
  const secondaryBtn = `${bebas.className} min-h-12 border-2 border-white/70 bg-transparent px-6 py-3 text-2xl tracking-[0.12em] text-white transition hover:border-white sm:min-h-14 sm:px-10 sm:py-5 sm:text-3xl`;

  if (viewedTeam) {
    const rivalFormation = getFormation(viewedTeam.formation);
    const rivalOccupants = new Map(
      (viewedTeam.occupants ?? []).map((o) => [o.slotId, o.player]),
    );
    const gap = viewedTeam.rating - rating;
    return (
      <div className={frameClass}>
        <div className={scrollerClass}>
          <div key={viewedTeam.teamId} className="home-fade-in my-auto w-full shrink-0 py-2">
            <p className={`${bebas.className} text-sm tracking-[0.35em] text-white/55`}>
              Rival · {rivalFormation.name}
            </p>
            <h1 className={`${bebas.className} mt-2 text-5xl tracking-wide text-white sm:text-6xl`}>
              {viewedTeam.shortName}
            </h1>
            <p className="mt-2 text-sm text-white/55">
              Rating {viewedTeam.rating.toFixed(1)} · Chem {viewedTeam.chemistry.toFixed(1)}
              {viewedTeam.coachName ? ` · ${viewedTeam.coachName} (${viewedTeam.coachRating})` : ""}
            </p>
            {!viewedTeam.isYou && (
              <p className={`mt-1 text-sm font-semibold ${diffTone(-gap)}`}>
                {formatSigned(-gap)} vs your rating
              </p>
            )}
            <div className="mx-auto mt-6 aspect-[3/4] w-full max-w-sm sm:max-w-md">
              <SlotPitch formation={rivalFormation} occupants={rivalOccupants} />
            </div>
          </div>
        </div>

        <div className={actionsClass}>
          <button type="button" onClick={() => setViewTeamId(null)} className={primaryBtn}>
            Back to table
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={frameClass}>
      <div className={scrollerClass}>
        <div key={`${step}-${lineIndex}`} className="home-fade-in my-auto w-full shrink-0 py-2">
        {step === "squad" && (
          <>
            <p className={`${bebas.className} text-sm tracking-[0.35em] text-white/55`}>
              {season
                ? `Season ${season.number} · Division ${season.division}`
                : `Your ${starterCount} · ${formation.name}`}
            </p>
            <h1 className={`${bebas.className} mt-2 text-5xl tracking-wide text-white sm:text-6xl`}>
              {clubName}
            </h1>
            <p className="mt-2 text-sm text-white/55">
              {rules.fit
                ? `${naturalStarters}/${starterCount} in natural position${
                    fitCost < 0 ? ` · ${fitCost.toFixed(1)} from misplaced players` : ""
                  }`
                : "Your starting lineup"}
            </p>
            <div className="mx-auto mt-6 aspect-[3/4] w-full max-w-sm sm:max-w-md">
              <SlotPitch formation={formation} occupants={occupantMap} />
            </div>
          </>
        )}

        {step === "lines" && currentLine && (
          <>
            <p className={`${bebas.className} text-sm tracking-[0.35em] text-white/55`}>
              vs Field · {lineIndex + 1}/{LINE_REVEAL.length}
            </p>
            <h1 className={`${bebas.className} mt-2 text-5xl tracking-wide text-white sm:text-6xl`}>
              {currentLineMeta.label}
            </h1>

            <div className="mx-auto mt-10 grid w-full max-w-lg grid-cols-2 gap-4">
              <div className="border-2 border-white bg-black/55 px-4 py-6">
                <div className="text-xs tracking-[0.18em] text-white/50 uppercase">You</div>
                <div className={`${bebas.className} mt-2 text-6xl leading-none text-white`}>
                  {currentLine.yours.toFixed(1)}
                </div>
              </div>
              <div className="border-2 border-white/40 bg-black/45 px-4 py-6">
                <div className="text-xs tracking-[0.18em] text-white/50 uppercase">Field avg</div>
                <div className={`${bebas.className} mt-2 text-6xl leading-none text-white/70`}>
                  {currentLine.leagueAvg.toFixed(1)}
                </div>
              </div>
            </div>

            <p className={`${bebas.className} mt-8 text-3xl tracking-wide text-white`}>
              Rank #{currentLine.rank}
              <span className="text-white/40"> / {currentLine.fieldSize}</span>
            </p>
            <p
              className={`mt-2 text-lg font-semibold ${diffTone(currentLine.yours - currentLine.leagueAvg)}`}
            >
              {formatSigned(currentLine.yours - currentLine.leagueAvg)} vs average
            </p>

            <div className="mx-auto mt-8 flex max-w-md justify-center gap-2">
              {LINE_REVEAL.map((line, i) => (
                <span
                  key={line.group}
                  className={`h-1.5 flex-1 ${i <= lineIndex ? "bg-white" : "bg-white/20"}`}
                />
              ))}
            </div>
          </>
        )}

        {step === "hindsight" && hindsight && (
          <>
            <p className={`${bebas.className} text-sm tracking-[0.35em] text-white/55`}>
              Perfect Draft
            </p>
            <h1 className={`${bebas.className} mt-2 text-5xl tracking-wide text-white sm:text-6xl`}>
              What Was There
            </h1>
            <p className="mx-auto mt-2 max-w-lg text-sm text-white/55">
              The best squad your pick slots could have reached, with every rival pick left exactly
              as it happened.
            </p>

            <div className="mx-auto mt-8 grid w-full max-w-lg grid-cols-2 gap-4">
              <div className="border-2 border-white/40 bg-black/45 px-4 py-6">
                <div className="text-xs tracking-[0.18em] text-white/50 uppercase">You drafted</div>
                <div className={`${bebas.className} mt-2 text-6xl leading-none text-white/70`}>
                  {rating.toFixed(1)}
                </div>
              </div>
              <div className="border-2 border-white bg-black/55 px-4 py-6">
                <div className="text-xs tracking-[0.18em] text-white/50 uppercase">Was possible</div>
                <div className={`${bebas.className} mt-2 text-6xl leading-none text-white`}>
                  {hindsight.rating.toFixed(1)}
                </div>
              </div>
            </div>

            <p className={`mt-6 text-lg font-semibold ${diffTone(rating - hindsight.rating)}`}>
              {formatSigned(rating - hindsight.rating)} left on the board
            </p>
            {hindsight.coachName && (
              <p className="mt-1 text-sm text-white/45">
                Ideal coach: {hindsight.coachName} ({hindsight.coachRating})
              </p>
            )}

            <div className="mx-auto mt-6 aspect-[3/4] w-full max-w-sm sm:max-w-md">
              <SlotPitch
                formation={formation}
                occupants={new Map(
                  (hindsight.occupants ?? []).map((o) => [o.slotId, o.player]),
                )}
              />
            </div>
          </>
        )}

        {step === "result" && (
          <>
            <p className={`${bebas.className} text-sm tracking-[0.35em] text-white/55`}>
              {season
                ? `Season ${season.number} Complete · Division ${season.division}`
                : `Draft Complete · ${formation.name}`}
            </p>
            <h1 className={`${bebas.className} mt-2 text-5xl tracking-wide text-white sm:text-6xl`}>
              {clubName}
            </h1>
            <p className={`${bebas.className} mt-4 text-4xl tracking-wide text-white`}>
              #{rank}
              <span className="text-2xl text-white/40"> / {fieldSize}</span>
            </p>
            {season && (
              <div className="mx-auto mt-5 max-w-md">
                <p
                  className={`${bebas.className} text-3xl tracking-wide ${
                    season.movement === "promoted"
                      ? "text-emerald-300"
                      : season.movement === "relegated"
                        ? "text-amber-300"
                        : "text-white"
                  }`}
                >
                  {season.outcomeLabel}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-white/50">
                  Promotion: #{season.promotionMaxRank} or better · Relegation: #
                  {season.relegationMinRank} or lower
                </p>
              </div>
            )}

            <div className={`mx-auto mt-8 grid w-full max-w-md gap-3 ${rules.chemistry || rules.fit ? "grid-cols-3" : "grid-cols-1"}`}>
              <div className="border-2 border-white bg-black/55 px-3 py-4">
                <div className="text-[10px] tracking-[0.16em] text-white/50 uppercase">Rating</div>
                <div className={`${bebas.className} mt-1 text-4xl leading-none text-white`}>
                  {rating.toFixed(1)}
                </div>
              </div>
              {rules.chemistry && (
              <div className="border border-white/35 bg-black/45 px-3 py-4">
                <div className="text-[10px] tracking-[0.16em] text-white/50 uppercase">Chem</div>
                <div className={`${bebas.className} mt-1 text-4xl leading-none text-white`}>
                  {chemistry.toFixed(1)}
                </div>
              </div>
              )}
              {rules.fit && (
              <div className="border border-white/35 bg-black/45 px-3 py-4">
                <div className="text-[10px] tracking-[0.16em] text-white/50 uppercase">Natural</div>
                <div className={`${bebas.className} mt-1 text-4xl leading-none text-white`}>
                  {naturalStarters}
                  <span className="text-xl text-white/40">/{starterCount}</span>
                </div>
              </div>
              )}
            </div>

            <div className="mx-auto mt-8 w-full max-w-md text-left">
              <p
                className={`${bebas.className} mb-3 text-center text-lg tracking-[0.2em] text-white/50`}
              >
                Tap a club to see their squad
              </p>
              <ul className="max-h-[34vh] space-y-1 overflow-y-auto">
                {teams.map((row, i) => (
                  <li key={row.teamId}>
                    <button
                      type="button"
                      onClick={() => setViewTeamId(row.teamId)}
                      className={`flex w-full items-center gap-3 px-3 py-2 text-left transition ${
                        row.isYou
                          ? "bg-white text-black"
                          : "text-white/75 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      <span
                        className={`${bebas.className} w-6 text-lg ${row.isYou ? "text-black/50" : "text-white/40"}`}
                      >
                        {i + 1}
                      </span>
                      <span
                        className={`min-w-0 flex-1 truncate text-sm font-semibold ${row.isYou ? "text-black" : "text-white"}`}
                      >
                        {row.shortName}
                      </span>
                      <span className={`text-xs ${row.isYou ? "text-black/50" : "text-white/40"}`}>
                        {row.formation}
                      </span>
                      <span className={`${bebas.className} text-xl ${row.isYou ? "text-black" : "text-white"}`}>
                        {row.rating.toFixed(1)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
        </div>
      </div>

      <div className={actionsClass}>
        {step !== "squad" && (
          <button type="button" onClick={goBack} className={secondaryBtn}>
            Back
          </button>
        )}
        {continueLabel && (
          <button type="button" onClick={goNext} className={primaryBtn}>
            {continueLabel}
          </button>
        )}
        {step === "result" && (
          <>
            {season && (
              <button
                type="button"
                onClick={playNextSeason}
                disabled={seasonPending}
                className={`${primaryBtn} disabled:opacity-60`}
              >
                {seasonPending ? "Starting…" : "Play next season →"}
              </button>
            )}
            {season && (
              <Link href={leaderboardHref ?? "/leaderboard"} className={secondaryBtn}>
                Leaderboard
              </Link>
            )}
            <Link href="/" className={season ? secondaryBtn : primaryBtn}>
              Menu
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
