"use client";

import { useState } from "react";
import Link from "next/link";
import { bebas, barlow } from "@/lib/game-fonts";

type Chapter = {
  title: string;
  lead: string;
  tiles?: { label: string; value: string; note?: string }[];
  points?: { label: string; text: string }[];
};

/**
 * The rules, in the game's own numbers. Every figure here is the live
 * constant from `formations.ts`, `chemistry.ts`, `team-rating.ts` and
 * `experience.ts` — if the balance is retuned, this copy has to move with
 * it, because it's the only place the player is told how to win.
 */
const CHAPTERS: Chapter[] = [
  {
    title: "The Draft",
    lead: "One board, sixteen rounds, everyone filling the same team sheet. The order snakes — whoever picks last in a round picks first in the next, so a late slot pays you back straight away.",
    points: [
      {
        label: "Sixteen picks",
        text: "Eleven starters, four on the bench, one coach. No trades, no waivers.",
      },
      {
        label: "Gone is gone",
        text: "Every club draws from the same pool. If you want two real-world teammates, you need both before your rivals take either.",
      },
      {
        label: "The CPU is not picking by rating",
        text: "Rival clubs value a player by what he adds over the next-best option for that slot in their shape. Stars slide when a position is deep and get reached for when it is thin — and each club has its own temperament, so the board never plays out the same way twice.",
      },
    ],
  },
  {
    title: "Your Shape",
    lead: "You lock a formation before the draft and you never change it. The eleven slots split most of your rating equally, so the shape decides where your rating gets spent.",
    tiles: [
      { label: "Starting XI", value: "86%", note: "11 equal slots" },
      { label: "Coach", value: "8%", note: "one pick" },
      { label: "Bench", value: "6%", note: "four picks" },
    ],
    points: [
      {
        label: "Every slot weighs the same",
        text: "A 5-3-2 spends five elevenths of its rating on defenders; a 4-2-3-1 spends four on the front line. A weak slot costs you the same whether it is a striker or a right-back.",
      },
      {
        label: "No hiding a bad pick",
        text: "The shape cannot move to cover a position you lost on the board, so pick a formation you can actually fill.",
      },
      {
        label: "The bench is not dead time",
        text: "Four picks share 6% — roughly a fifth of a starting slot each.",
      },
    ],
  },
  {
    title: "Position Fit",
    lead: "Where a player stands matters as much as who he is. Players who genuinely cover several positions are yours to place; everyone else pays to be moved.",
    tiles: [
      { label: "Natural", value: "0", note: "+2 chem" },
      { label: "Comfortable", value: "−1", note: "+0.5 chem" },
      { label: "Adapting", value: "−4", note: "−1.5 chem" },
      { label: "Out of position", value: "−9", note: "−3.5 chem" },
      { label: "Emergency", value: "−20", note: "−6 chem" },
    ],
    points: [
      {
        label: "It costs twice",
        text: "A misplaced player loses rating points at his slot and drags his chemistry down as well, which costs him again through potential.",
      },
      {
        label: "Keepers are a wall",
        text: "No outfielder can go in goal and no keeper can fill an outfield slot, at any price.",
      },
    ],
  },
  {
    title: "Chemistry",
    lead: "Chemistry is built pair by pair. Every two squad-mates start at 3 and add points for whatever they genuinely share — the links stack rather than taking the best one.",
    tiles: [
      { label: "Same club", value: "+10", note: "+15 across leagues" },
      { label: "Same league", value: "+3", note: "free in one-league drafts" },
      { label: "Same nation", value: "+2", note: "+5 across leagues" },
    ],
    points: [
      {
        label: "Real teammates dominate",
        text: "A shared club also means a shared league and often a shared nation, all at once. That is why one real-world back four beats four unrelated internationals.",
      },
      {
        label: "Standing next to each other counts more",
        text: "A link between neighbouring slots is worth 1.75× the same link across the pitch. Bench links count half. Placing a multi-position player is really a choice about where his links land.",
      },
      {
        label: "8 out of 10 is neutral",
        text: "A one-league squad with everyone in his natural position sits on 8 and gets nothing for free. Above 8 you are earning; below it you are bleeding.",
      },
    ],
  },
  {
    title: "The Coach",
    lead: "One pick, 8% of your rating — and the only pick that touches all fifteen others. That is why coaches go early.",
    points: [
      {
        label: "Squad-wide chemistry",
        text: "Above 80 he adds up to +1.2 chemistry to every player you own.",
      },
      {
        label: "Development",
        text: "Above 75 he makes the gap between overall and potential easier to close, for the whole squad at once.",
      },
      {
        label: "Never a penalty",
        text: "A weak coach does not cost you anything. He simply does not help — so a cheap late coach is a real option if the board is giving you value elsewhere.",
      },
    ],
  },
  {
    title: "Age Balance",
    lead: "A small tax on lopsided squads. Anyone from 23 to 30 is in his prime and completely free.",
    points: [
      { label: "All youth, no veterans", text: "Up to −6 rating. Nobody in the squad has been there before." },
      { label: "All veterans, no youth", text: "Up to −3 rating. Experience, no flair." },
      {
        label: "A mix costs nothing",
        text: "One veteran directly offsets one young player, so you only ever pay if a squad is genuinely one-sided.",
      },
    ],
  },
  {
    title: "How To Win",
    lead: "The squads that finish clear of the field are not the ones with the highest raw ratings. They are the ones where three things compound at once.",
    points: [
      {
        label: "Buy potential, not just overall",
        text: "Chemistry above neutral pulls a player toward his potential, and a strong coach widens that. A 78-rated 21-year-old with 90 potential in a high-chemistry, well-coached side out-rates an 84 who has nothing left to give.",
      },
      {
        label: "Draft in pairs",
        text: "Two real-world teammates in neighbouring slots is the densest chemistry available, and it is the one thing rivals cannot take back off you once you have both.",
      },
      {
        label: "Fill your shape exactly",
        text: "Eleven natural fits is worth several rating points over the same eleven players shuffled to make them fit.",
      },
      {
        label: "Spend early picks where the drop-off is steepest",
        text: "Elite forwards run out long before competent full-backs and keepers do. Take the position that gets worse fastest, not the highest number on the board.",
      },
      {
        label: "Keep the ages honest",
        text: "A prime-heavy squad with a couple of kids and a couple of veterans pays no tax at all. Free rating.",
      },
    ],
  },
];

export function HowToPlayFlow() {
  const [index, setIndex] = useState(0);
  const chapter = CHAPTERS[index];
  const isLast = index === CHAPTERS.length - 1;

  return (
    <div className={`${barlow.className} flex w-full max-w-3xl flex-col items-center text-center`}>
      <div key={index} className="home-fade-in w-full">
        <p className={`${bebas.className} text-sm tracking-[0.35em] text-white/55`}>
          How To Play · {index + 1}/{CHAPTERS.length}
        </p>
        <h1 className={`${bebas.className} mt-2 text-5xl tracking-wide text-white sm:text-6xl`}>
          {chapter.title}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/65 sm:text-base">
          {chapter.lead}
        </p>

        {chapter.tiles && (
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {chapter.tiles.map((tile) => (
              <div
                key={tile.label}
                className="min-w-28 flex-1 border border-white/25 bg-black/45 px-4 py-4"
              >
                <div className="text-[10px] tracking-[0.16em] text-white/50 uppercase">
                  {tile.label}
                </div>
                <div className={`${bebas.className} mt-1 text-4xl leading-none text-white`}>
                  {tile.value}
                </div>
                {tile.note && <div className="mt-1 text-[11px] text-white/45">{tile.note}</div>}
              </div>
            ))}
          </div>
        )}

        {chapter.points && (
          <ul className="mx-auto mt-8 max-w-xl space-y-4 text-left">
            {chapter.points.map((point) => (
              <li key={point.label} className="border-l-2 border-white/30 pl-4">
                <p className={`${bebas.className} text-xl tracking-[0.1em] text-white`}>
                  {point.label}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-white/60">{point.text}</p>
              </li>
            ))}
          </ul>
        )}

        <div className="mx-auto mt-10 flex max-w-md justify-center gap-2">
          {CHAPTERS.map((c, i) => (
            <button
              key={c.title}
              type="button"
              aria-label={c.title}
              onClick={() => setIndex(i)}
              className={`h-1.5 flex-1 transition ${i <= index ? "bg-white" : "bg-white/20 hover:bg-white/40"}`}
            />
          ))}
        </div>
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
        {index > 0 && (
          <button
            type="button"
            onClick={() => setIndex((i) => i - 1)}
            className={`${bebas.className} border-2 border-white/60 bg-black/55 px-10 py-5 text-3xl tracking-[0.12em] text-white transition hover:border-white`}
          >
            Back
          </button>
        )}
        {!isLast ? (
          <button
            type="button"
            onClick={() => setIndex((i) => i + 1)}
            className={`${bebas.className} border-2 border-white bg-white px-12 py-5 text-3xl tracking-[0.12em] text-black transition hover:bg-transparent hover:text-white`}
          >
            Next →
          </button>
        ) : (
          <Link
            href="/draft"
            className={`${bebas.className} border-2 border-white bg-white px-12 py-5 text-3xl tracking-[0.12em] text-black transition hover:bg-transparent hover:text-white`}
          >
            Start a draft →
          </Link>
        )}
        <Link
          href="/"
          className={`${bebas.className} border-2 border-white/40 bg-black/45 px-10 py-5 text-3xl tracking-[0.12em] text-white/80 transition hover:border-white hover:text-white`}
        >
          Menu
        </Link>
      </div>
    </div>
  );
}
