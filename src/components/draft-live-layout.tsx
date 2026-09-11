"use client";

import { useEffect, useState, type ReactNode } from "react";
import { barlow, bebas } from "@/lib/game-fonts";

export function DraftLiveLayout({
  board,
  team,
  cpuPicksAfterYou,
  currentPick,
}: {
  board: ReactNode;
  team: ReactNode;
  cpuPicksAfterYou: number;
  currentPick: number;
}) {
  const [tab, setTab] = useState<"draft" | "team">("draft");
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    setWaiting(false);
  }, [currentPick]);

  useEffect(() => {
    if (!waiting) return;
    const timer = window.setTimeout(() => setWaiting(false), 8000);
    return () => window.clearTimeout(timer);
  }, [waiting]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid shrink-0 grid-cols-2 gap-1 pb-3 lg:hidden">
        <button
          type="button"
          onClick={() => setTab("draft")}
          className={`${bebas.className} min-h-11 border-2 px-3 py-2 text-xl tracking-[0.14em] ${
            tab === "draft"
              ? "border-white bg-white text-black"
              : "border-white/50 bg-transparent text-white"
          }`}
        >
          Draft
        </button>
        <button
          type="button"
          onClick={() => setTab("team")}
          className={`${bebas.className} min-h-11 border-2 px-3 py-2 text-xl tracking-[0.14em] ${
            tab === "team"
              ? "border-white bg-white text-black"
              : "border-white/50 bg-transparent text-white"
          }`}
        >
          Team
        </button>
      </div>

      <div
        className="flex min-h-0 flex-1 flex-col gap-4 lg:grid lg:grid-cols-[minmax(320px,400px)_1fr]"
        onSubmitCapture={(event) => {
          const form = event.target;
          if (!(form instanceof HTMLFormElement)) return;
          if (!form.elements.namedItem("playerId") && !form.elements.namedItem("coachId")) {
            return;
          }
          setTab("draft");
          setWaiting(true);
        }}
      >
        <div
          className={`${tab === "draft" ? "flex" : "hidden"} relative min-h-0 flex-1 flex-col lg:flex`}
        >
          {board}
          {waiting && (
            <div
              className={`${barlow.className} absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 px-6 py-10 text-center`}
              role="status"
              aria-live="polite"
            >
              <p className={`${bebas.className} text-sm tracking-[0.28em] text-white/50`}>
                Pick locked
              </p>
              <h2 className={`${bebas.className} mt-2 text-4xl tracking-wide text-white`}>
                {cpuPicksAfterYou > 0 ? `${cpuPicksAfterYou} clubs picking` : "Saving your pick"}
              </h2>
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/60">
                {cpuPicksAfterYou > 0
                  ? "Rivals are taking their turns. You're back as soon as they finish."
                  : "Updating the draft."}
              </p>
              <div className="cpu-wait-bar mx-auto mt-6 h-1 w-32 bg-white/20">
                <span className="block h-full w-1/2 bg-white" />
              </div>
            </div>
          )}
        </div>
        <div
          className={`${tab === "team" ? "flex" : "hidden"} min-h-0 flex-1 flex-col overflow-y-auto lg:flex lg:overflow-hidden`}
        >
          {team}
        </div>
      </div>
    </div>
  );
}
