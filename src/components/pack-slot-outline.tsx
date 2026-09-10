"use client";

import { useState } from "react";
import { buyPack, buyCoachPack } from "@/app/packs/[id]/actions";

// Deliberately NOT importing from "@/lib/packs" here — that module pulls in
// the Prisma client (via lib/db.ts) at module-evaluation time, which is fine
// for the server-rendered pitch around this component but would break the
// browser bundle for this one, since it's a client component. This local
// type is just the serializable slice of a PACK_TIERS entry the page passes
// down as a prop.
export type TierSummary = {
  key: string;
  name: string;
  price: number;
  enhancedChance: number;
};

type Props = {
  packRunId: number;
  cash: number;
  tiers: TierSummary[];
  label: string;
} & ({ kind: "player"; group: "GK" | "DEF" | "MID" | "FWD" } | { kind: "coach" });

/** An empty formation/coach slot on the Packs-mode squad pitch — click it to
 *  expand a tier picker in place, buy a pack for exactly that slot. */
export function PackSlotOutline(props: Props) {
  const [open, setOpen] = useState(false);
  const { packRunId, cash, tiers, label } = props;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-[190px] w-40 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-white/40 text-white/70 transition hover:border-white/70 hover:bg-white/5 hover:text-white"
      >
        <span className="text-2xl leading-none">+</span>
        <span className="text-xs font-semibold">{label}</span>
      </button>
    );
  }

  return (
    <div className="flex w-40 flex-col gap-1.5 rounded-xl border-2 border-white/50 bg-black/40 p-2 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-white">{label}</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-white/60 hover:text-white"
        >
          ✕
        </button>
      </div>
      <div className="flex flex-col gap-1">
        {tiers.map((tier) => {
          const affordable = cash >= tier.price;
          return (
            <form key={tier.key} action={props.kind === "player" ? buyPack : buyCoachPack}>
              <input type="hidden" name="packRunId" value={packRunId} />
              <input type="hidden" name="tier" value={tier.key} />
              {props.kind === "player" && (
                <input type="hidden" name="positionGroup" value={props.group} />
              )}
              <button
                type="submit"
                disabled={!affordable}
                className="flex w-full items-center justify-between rounded-md bg-white/10 px-2 py-1.5 text-left text-[11px] font-medium text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-white/10"
              >
                <span>{tier.name.replace(" Pack", "")}</span>
                <span className="font-bold">${tier.price.toLocaleString()}</span>
              </button>
            </form>
          );
        })}
      </div>
    </div>
  );
}
