"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { barlow, bebas } from "@/lib/game-fonts";
import { PREMIER_LEAGUE } from "@/lib/league-data";
import { startDraft } from "@/app/draft/actions";
import {
  defaultFormationForMode,
  formationsForMode,
} from "@/lib/formations";
import {
  GAME_MODE_CONFIG,
  DEFAULT_GAME_MODE,
  type GameMode,
} from "@/lib/game-mode";
import {
  DEFAULT_SCORING_RULES,
  SCORING_RULE_FIELDS,
  type ScoringRules,
} from "@/lib/scoring-rules";

type Step = "mode" | "leagues" | "teams" | "years" | "formation" | "rules";

const MAX_YEARS = 3;

const STEP_INFO: Record<Step, string> = {
  mode:
    "Classic fields eleven starters and four substitutes. 7s uses seven starters and two substitutes with its own tighter formations and shorter draft.",
  leagues:
    "Pick one or more leagues to draft from. Every league fields its real clubs; the Premier League also uses its real head coaches.",
  teams:
    "Defaults to 20 teams per league you picked (2 leagues → 40, 3 → 60, and so on).",
  years: "Pick 1–3 player card years. Only players from those years can be drafted.",
  formation:
    "Locked for the whole draft. Every starting slot counts equally, so the shape decides where you can afford to lose a battle. Natural positions gain rating and chemistry; anyone played out of position loses both.",
  rules:
    "Classic is the full game — chemistry, coach, age, potential and fit all count, same as always. Edit opens a popup if you want to turn any of those off.",
};

/** Dots on a mini pitch — enough to read a shape at a glance without
 *  pulling in the full draft-board pitch. */
function FormationPreview({ slots }: { slots: { id: string; x: number; y: number }[] }) {
  return (
    <div className="relative mx-auto h-28 w-20">
      <div className="absolute inset-0 border border-white/25" />
      <div className="absolute top-1/2 right-0 left-0 border-t border-white/15" />
      {slots.map((slot) => (
        <span
          key={slot.id}
          style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
          className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current"
        />
      ))}
    </div>
  );
}

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

export function DraftSetupWizard({
  topLeagues,
  otherLeagues,
  availableYears,
  teamsPerLeagueDefault,
  maxTeamsPerLeague,
}: {
  topLeagues: string[];
  otherLeagues: string[];
  availableYears: number[];
  teamsPerLeagueDefault: number;
  maxTeamsPerLeague: number;
}) {
  const defaultYear = availableYears[0] ?? 2026;
  const [step, setStep] = useState<Step>("mode");
  const [gameMode, setGameMode] = useState<GameMode>(DEFAULT_GAME_MODE);
  const [selected, setSelected] = useState<string[]>([PREMIER_LEAGUE]);
  const [totalTeams, setTotalTeams] = useState(teamsPerLeagueDefault);
  const [showMore, setShowMore] = useState(false);
  const [selectedYears, setSelectedYears] = useState<number[]>([defaultYear]);
  const [formation, setFormation] = useState(
    defaultFormationForMode(DEFAULT_GAME_MODE),
  );
  const [rules, setRules] = useState<ScoringRules>(DEFAULT_SCORING_RULES);
  const [divisionsEnabled, setDivisionsEnabled] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!editOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setEditOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editOpen]);

  const minTotal = 2;
  const maxTotal = Math.max(minTotal, selected.length * maxTeamsPerLeague);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedYearSet = useMemo(() => new Set(selectedYears), [selectedYears]);
  const leagueOptions = showMore ? [...topLeagues, ...otherLeagues] : topLeagues;
  const availableFormations = formationsForMode(gameMode);

  function chooseGameMode(mode: GameMode) {
    setGameMode(mode);
    setFormation(defaultFormationForMode(mode));
    if (mode !== "sevens") setDivisionsEnabled(false);
    setError(null);
  }

  function clampTeams(n: number, leagueCount = selected.length) {
    const max = Math.max(minTotal, leagueCount * maxTeamsPerLeague);
    return Math.max(minTotal, Math.min(max, n || minTotal));
  }

  function toggleLeague(league: string) {
    setSelected((prev) => {
      const next = prev.includes(league)
        ? prev.filter((l) => l !== league)
        : [...prev, league];
      const leagueCount = Math.max(1, next.length);
      setTotalTeams(
        clampTeams(leagueCount * teamsPerLeagueDefault, leagueCount),
      );
      return next;
    });
    setError(null);
  }

  function selectTop5() {
    setSelected([...topLeagues]);
    const leagueCount = Math.max(1, topLeagues.length);
    setTotalTeams(
      clampTeams(leagueCount * teamsPerLeagueDefault, leagueCount),
    );
    setError(null);
  }

  function toggleYear(year: number) {
    setSelectedYears((prev) => {
      if (prev.includes(year)) {
        if (prev.length === 1) return prev;
        return prev.filter((y) => y !== year);
      }
      if (prev.length >= MAX_YEARS) return prev;
      return [...prev, year].sort((a, b) => b - a);
    });
    setError(null);
  }

  function adjustTeams(delta: number) {
    setTotalTeams((n) => clampTeams((n || minTotal) + delta));
  }

  function goNext() {
    if (step === "mode") {
      setStep("leagues");
      return;
    }
    if (step === "leagues") {
      if (selected.length === 0) {
        setError("Pick at least one league");
        return;
      }
      setTotalTeams((n) => clampTeams(n));
      setStep("teams");
      return;
    }
    if (step === "teams") {
      setTotalTeams(clampTeams(totalTeams));
      setStep("years");
      return;
    }
    if (step === "years") {
      if (selectedYears.length === 0) {
        setError("Pick at least one year");
        return;
      }
      setStep("formation");
      return;
    }
    if (step === "formation") {
      setStep("rules");
    }
  }

  function goBack() {
    setError(null);
    setShowMore(false);
    if (step === "leagues") setStep("mode");
    if (step === "teams") setStep("leagues");
    if (step === "years") setStep("teams");
    if (step === "formation") setStep("years");
    if (step === "rules") {
      setEditOpen(false);
      setStep("formation");
    }
  }

  function submit(nextRules: ScoringRules = rules) {
    if (selectedYears.length === 0) {
      setError("Pick at least one year");
      return;
    }
    const formData = new FormData();
    formData.set("gameMode", gameMode);
    for (const league of selected) formData.append("leagues", league);
    for (const year of selectedYears) formData.append("years", String(year));
    formData.set("totalTeams", String(clampTeams(totalTeams)));
    formData.set("formation", formation);
    formData.set("chemistry", nextRules.chemistry ? "1" : "0");
    formData.set("coach", nextRules.coach ? "1" : "0");
    formData.set("age", nextRules.age ? "1" : "0");
    formData.set("potential", nextRules.potential ? "1" : "0");
    formData.set("fit", nextRules.fit ? "1" : "0");
    formData.set("divisionsEnabled", divisionsEnabled ? "1" : "0");
    startTransition(() => {
      startDraft(formData);
    });
  }

  const classic = SCORING_RULE_FIELDS.every((field) => rules[field.key]);
  const customOff = SCORING_RULE_FIELDS.filter((field) => !rules[field.key]).map((f) => f.label);

  return (
    <div className="flex w-full max-w-4xl flex-col items-center py-2 text-center sm:py-4">
      <div key={step} className="home-fade-in w-full">
        {step === "mode" && (
          <>
            <h1
              className={`${bebas.className} flex items-center justify-center text-4xl tracking-wide text-white sm:text-6xl`}
            >
              Choose Game Mode
              <InfoTip text={STEP_INFO.mode} />
            </h1>
            <div className="mx-auto mt-8 grid w-full max-w-2xl gap-3 sm:mt-10 sm:grid-cols-2">
              {(Object.entries(GAME_MODE_CONFIG) as [GameMode, (typeof GAME_MODE_CONFIG)[GameMode]][]).map(
                ([mode, config]) => {
                  const on = gameMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => chooseGameMode(mode)}
                      className={`border-2 px-5 py-6 text-left transition ${
                        on
                          ? "border-white bg-white text-black"
                          : "border-white/40 bg-black/55 text-white hover:border-white"
                      }`}
                    >
                      <span className={`${bebas.className} block text-4xl tracking-wide`}>
                        {config.label}
                      </span>
                      <span className="mt-2 block text-sm leading-relaxed opacity-65">
                        {config.starters} starters · {config.bench} subs
                      </span>
                      <span className="mt-1 block text-sm leading-relaxed opacity-65">
                        {config.description}
                      </span>
                    </button>
                  );
                },
              )}
            </div>
          </>
        )}

        {step === "leagues" && (
          <>
            <h1
              className={`${bebas.className} flex items-center justify-center text-4xl tracking-wide text-white sm:text-6xl`}
            >
              Choose Leagues
              <InfoTip text={STEP_INFO.leagues} />
            </h1>

            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={selectTop5}
                className={`${bebas.className} border-2 border-white/50 bg-black/50 px-8 py-4 text-2xl tracking-[0.16em] text-white transition hover:border-white hover:bg-white hover:text-black`}
              >
                Select Top 5
              </button>
            </div>

            <div
              className={`mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 ${
                showMore ? "max-h-[42vh] overflow-y-auto pr-1" : ""
              }`}
            >
              {leagueOptions.map((league) => {
                const on = selectedSet.has(league);
                return (
                  <button
                    key={league}
                    type="button"
                    onClick={() => toggleLeague(league)}
                    className={`${bebas.className} border-2 px-4 py-5 text-xl tracking-wide transition sm:text-2xl ${
                      on
                        ? "border-white bg-white text-black"
                        : "border-white/40 bg-black/55 text-white hover:border-white"
                    }`}
                  >
                    {league}
                    {league === PREMIER_LEAGUE ? " ★" : ""}
                  </button>
                );
              })}
            </div>

            {otherLeagues.length > 0 && (
              <button
                type="button"
                onClick={() => setShowMore((v) => !v)}
                className={`${bebas.className} mt-5 text-xl tracking-[0.18em] text-white/80 transition hover:text-white`}
              >
                {showMore ? "Show less" : `+ ${otherLeagues.length} more`}
              </button>
            )}
          </>
        )}

        {step === "teams" && (
          <>
            <h1
              className={`${bebas.className} flex items-center justify-center text-4xl tracking-wide text-white sm:text-6xl`}
            >
              How Many Teams?
              <InfoTip text={STEP_INFO.teams} />
            </h1>

            <div className="mt-10 flex items-center justify-center gap-3 sm:mt-12 sm:gap-6">
              <button
                type="button"
                onClick={() => adjustTeams(-1)}
                disabled={totalTeams <= minTotal}
                className={`${bebas.className} flex h-16 w-16 items-center justify-center border-2 border-white bg-black/55 text-4xl text-white transition hover:bg-white hover:text-black disabled:opacity-30 sm:h-20 sm:w-20 sm:text-5xl`}
              >
                −
              </button>
              <input
                type="number"
                min={minTotal}
                max={maxTotal}
                value={totalTeams}
                onChange={(e) => {
                  setTotalTeams(Number.parseInt(e.target.value, 10) || 0);
                }}
                onBlur={() => setTotalTeams(clampTeams(totalTeams))}
                className={`${bebas.className} w-28 border-2 border-white bg-black/55 px-2 py-3 text-center text-6xl tracking-wide text-white outline-none [appearance:textfield] sm:w-40 sm:px-3 sm:py-5 sm:text-7xl [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
              />
              <button
                type="button"
                onClick={() => adjustTeams(1)}
                disabled={totalTeams >= maxTotal}
                className={`${bebas.className} flex h-16 w-16 items-center justify-center border-2 border-white bg-black/55 text-4xl text-white transition hover:bg-white hover:text-black disabled:opacity-30 sm:h-20 sm:w-20 sm:text-5xl`}
              >
                +
              </button>
            </div>
          </>
        )}

        {step === "years" && (
          <>
            <h1
              className={`${bebas.className} flex items-center justify-center text-4xl tracking-wide text-white sm:text-6xl`}
            >
              Choose Years
              <InfoTip text={STEP_INFO.years} />
            </h1>

            <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
              {availableYears.map((year) => {
                const on = selectedYearSet.has(year);
                const atCap = !on && selectedYears.length >= MAX_YEARS;
                return (
                  <button
                    key={year}
                    type="button"
                    disabled={atCap}
                    onClick={() => toggleYear(year)}
                    className={`${bebas.className} border-2 px-4 py-6 text-3xl tracking-wide transition disabled:opacity-35 ${
                      on
                        ? "border-white bg-white text-black"
                        : "border-white/40 bg-black/55 text-white hover:border-white"
                    }`}
                  >
                    {year}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {step === "formation" && (
          <>
            <h1
              className={`${bebas.className} flex items-center justify-center text-4xl tracking-wide text-white sm:text-6xl`}
            >
              Choose Formation
              <InfoTip text={STEP_INFO.formation} />
            </h1>

            <div className="mt-8 grid grid-cols-2 gap-2 sm:mt-10 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
              {availableFormations.map((f) => {
                const on = formation === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFormation(f.key)}
                    className={`flex flex-col items-center gap-2 border-2 px-2 py-4 transition sm:gap-3 sm:px-3 sm:py-5 ${
                      on
                        ? "border-white bg-white text-black"
                        : "border-white/40 bg-black/55 text-white hover:border-white"
                    }`}
                  >
                    <span className={`${bebas.className} text-2xl tracking-wide sm:text-3xl`}>
                      {f.name}
                    </span>
                    <FormationPreview slots={f.slots} />
                    <span className="min-h-8 text-[11px] leading-tight font-medium opacity-70">
                      {f.blurb}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {step === "rules" && (
          <>
            <h1
              className={`${bebas.className} flex items-center justify-center text-4xl tracking-wide text-white sm:text-6xl`}
            >
              How You Play
              <InfoTip text={STEP_INFO.rules} />
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-sm text-white/55">
              {gameMode === "sevens"
                ? "Full 7s rules are on. Edit only if you want to turn factors off."
                : "Classic is the full game. Edit only if you want to turn factors off."}
            </p>

            <div className="mx-auto mt-10 flex w-full max-w-md flex-col gap-4">
              {gameMode === "sevens" && (
                <button
                  type="button"
                  aria-pressed={divisionsEnabled}
                  disabled={pending}
                  onClick={() => setDivisionsEnabled((enabled) => !enabled)}
                  className={`border-2 px-5 py-4 text-left transition disabled:opacity-50 ${
                    divisionsEnabled
                      ? "border-white bg-white text-black"
                      : "border-white/50 bg-transparent text-white hover:border-white"
                  }`}
                >
                  <span className="flex items-center justify-between gap-4">
                    <span>
                      <span className={`${bebas.className} block text-3xl tracking-wide`}>
                        Season Divisions
                      </span>
                      <span className="mt-1 block text-sm leading-snug opacity-65">
                        Start in Division 5. Top 20% go up, bottom 20% go down, and every
                        higher division drafts smarter.
                      </span>
                    </span>
                    <span className={`${bebas.className} shrink-0 text-xl tracking-[0.16em]`}>
                      {divisionsEnabled ? "On" : "Off"}
                    </span>
                  </span>
                </button>
              )}
              <button
                type="button"
                disabled={pending}
                onClick={() => setEditOpen(true)}
                className={`${bebas.className} border-2 border-white/50 bg-black/55 px-8 py-5 text-3xl tracking-[0.12em] text-white transition hover:border-white disabled:opacity-50`}
              >
                Edit
              </button>
              {!classic && (
                <p className={`${barlow.className} text-sm text-white/50`}>
                  Custom · off: {customOff.join(", ")}
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {error && <p className="mt-6 text-sm font-medium text-red-200">{error}</p>}

      <div className="sticky right-0 bottom-0 left-0 z-30 mt-8 grid w-full grid-cols-2 gap-3 border-t border-white/15 bg-black/85 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:static sm:mt-10 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-center sm:gap-4 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        {step !== "mode" && (
          <button
            type="button"
            onClick={goBack}
            disabled={pending}
            className={`${bebas.className} col-start-1 min-h-14 border-2 border-white/60 bg-black/55 px-4 py-3 text-2xl tracking-[0.12em] text-white transition hover:border-white disabled:opacity-50 sm:px-10 sm:py-5 sm:text-3xl`}
          >
            Back
          </button>
        )}

        {step !== "rules" && (
          <button
            type="button"
            onClick={goNext}
            className={`${bebas.className} col-start-2 min-h-14 border-2 border-white bg-white px-4 py-3 text-2xl tracking-[0.12em] text-black transition hover:bg-transparent hover:text-white sm:px-12 sm:py-5 sm:text-3xl`}
          >
            Continue →
          </button>
        )}

        {step === "rules" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setRules(DEFAULT_SCORING_RULES);
              submit(DEFAULT_SCORING_RULES);
            }}
            className={`${bebas.className} col-start-2 min-h-14 border-2 border-white bg-white px-4 py-3 text-2xl tracking-[0.12em] text-black transition hover:bg-transparent hover:text-white disabled:opacity-60 sm:px-12 sm:py-5 sm:text-3xl`}
          >
            {pending && classic
              ? "Starting…"
              : gameMode === "sevens"
                ? "Start 7s"
                : "Classic"}
          </button>
        )}
      </div>

      {editOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 px-3 py-[max(0.75rem,env(safe-area-inset-top))] sm:px-4"
          onClick={() => !pending && setEditOpen(false)}
        >
          <div
            role="dialog"
            aria-labelledby="what-counts-title"
            className="max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl overflow-y-auto overscroll-contain border-2 border-white bg-black p-4 text-left shadow-2xl sm:max-h-[90vh] sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id="what-counts-title"
                  className={`${bebas.className} text-4xl tracking-wide text-white sm:text-5xl`}
                >
                  What Counts
                </h2>
                <p className={`${barlow.className} mt-2 max-w-lg text-sm text-white/55`}>
                  On is the full game. Off means that factor does not move anyone&apos;s rating.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                disabled={pending}
                onClick={() => setEditOpen(false)}
                className={`${bebas.className} h-10 w-10 border-2 border-white/50 text-2xl leading-none text-white transition hover:border-white hover:bg-white hover:text-black`}
              >
                ×
              </button>
            </div>

            <div className="mt-6 grid gap-3">
              {SCORING_RULE_FIELDS.map((field) => {
                const on = rules[field.key];
                return (
                  <button
                    key={field.key}
                    type="button"
                    onClick={() => setRules((prev) => ({ ...prev, [field.key]: !prev[field.key] }))}
                    className={`flex items-center justify-between gap-4 border-2 px-5 py-4 text-left transition ${
                      on
                        ? "border-white bg-white text-black"
                        : "border-white/40 bg-black/55 text-white hover:border-white"
                    }`}
                  >
                    <span>
                      <span className={`${bebas.className} block text-2xl tracking-wide`}>
                        {field.label}
                      </span>
                      <span
                        className={`mt-1 block text-sm leading-snug ${on ? "text-black/60" : "text-white/50"}`}
                      >
                        {field.blurb}
                      </span>
                    </span>
                    <span className={`${bebas.className} shrink-0 text-xl tracking-[0.16em]`}>
                      {on ? "On" : "Off"}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-8 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                disabled={pending}
                onClick={() => setRules(DEFAULT_SCORING_RULES)}
                className={`${bebas.className} border-2 border-white/50 bg-black/55 px-6 py-3 text-xl tracking-[0.12em] text-white transition hover:border-white`}
              >
                Reset Classic
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => submit(rules)}
                className={`${bebas.className} border-2 border-white bg-white px-8 py-3 text-xl tracking-[0.12em] text-black transition hover:bg-transparent hover:text-white disabled:opacity-60`}
              >
                {pending ? "Starting…" : "Start Draft →"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
