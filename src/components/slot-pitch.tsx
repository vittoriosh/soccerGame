import Link from "next/link";
import { playerImageSrc, clubLogoSrc } from "@/lib/player-image";
import { flagUrl } from "@/lib/country-flags";
import { bebas } from "@/lib/game-fonts";
import { FIT_LABELS, type Fit, type Formation } from "@/lib/formations";

export type SlotOccupant = {
  name: string;
  /** Rating in THIS slot — already carries the position-fit penalty. */
  effective: number;
  imageUrl: string;
  chemistry: number;
  fit: Fit;
  club: string;
  clubId: number | null;
  league: string;
  nationality: string;
};

/** Fit is the thing the pitch has to communicate at a glance — a full XI of
 *  green rings means everyone is in their real position. */
const FIT_RING: Record<Fit, string> = {
  exact: "border-emerald-400",
  natural: "border-lime-300",
  reasonable: "border-amber-300",
  outOfPosition: "border-orange-400",
  emergency: "border-red-500",
};

function chemDot(chem: number): string {
  if (chem >= 8) return "bg-emerald-400";
  if (chem >= 5) return "bg-amber-300";
  return "bg-red-500";
}

/**
 * The formation as it actually is: eleven fixed slots, each either filled
 * (photo, live rating, chemistry, club/nation/league, a ring coloured by
 * how well the player fits the role) or empty and waiting. Empty slots are
 * links, so the pitch doubles as the draft board's position selector.
 */
export function SlotPitch({
  formation,
  occupants,
  selectedSlotId,
  slotHref,
  compact = false,
}: {
  formation: Formation;
  occupants: Map<string, SlotOccupant>;
  selectedSlotId?: string | null;
  slotHref?: (slotId: string) => string;
  compact?: boolean;
}) {
  const tokenSize = compact ? "h-11 w-11" : "h-12 w-12 sm:h-16 sm:w-16";
  const nameSize = compact ? "text-[9px]" : "text-[9px] sm:text-[11px]";
  const metaSize = compact ? "text-[8px]" : "text-[8px] sm:text-[10px]";
  const metaWidth = compact ? "max-w-[88px]" : "max-w-[84px] sm:max-w-[110px]";

  return (
    <div className="relative h-full min-h-0 overflow-hidden rounded-2xl bg-emerald-900/70">
      <div className="pointer-events-none absolute inset-3 rounded-lg border border-white/15" />
      <div className="pointer-events-none absolute top-1/2 right-3 left-3 border-t border-white/15" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15" />
      <div className="pointer-events-none absolute inset-x-[22%] top-3 h-[14%] rounded-b-lg border border-t-0 border-white/15" />
      <div className="pointer-events-none absolute inset-x-[22%] bottom-3 h-[14%] rounded-t-lg border border-b-0 border-white/15" />

      {formation.slots.map((slot) => {
        const player = occupants.get(slot.id);
        const selected = selectedSlotId === slot.id;
        const href = !player && slotHref ? slotHref(slot.id) : null;
        const crest = player ? clubLogoSrc(player.clubId, 30) : null;
        const flag = player ? flagUrl(player.nationality) : null;
        const identity = player
          ? `${player.name} — ${player.club || "Free agent"} · ${player.league} · ${player.nationality} (${FIT_LABELS[player.fit]} at ${slot.code})`
          : undefined;

        const token = player ? (
          <>
            <span className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={playerImageSrc(player.imageUrl)}
                alt=""
                width={64}
                height={64}
                className={`${tokenSize} rounded-full border-2 bg-black/40 object-cover ${FIT_RING[player.fit]}`}
                title={identity}
              />
              <span
                className={`${bebas.className} absolute -top-1 -left-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-black px-1 text-[11px] leading-none text-white`}
              >
                {player.effective}
              </span>
              <span
                title={`Chemistry ${player.chemistry}/10`}
                className={`absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border border-black ${chemDot(
                  player.chemistry,
                )}`}
              />
            </span>
            <div className={`${metaWidth} text-center leading-tight`} title={identity}>
              <div className={`${nameSize} truncate font-semibold text-white`}>{player.name}</div>
              <div
                className={`${metaSize} mt-0.5 flex items-center justify-center gap-1 text-white/80`}
              >
                {crest && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={crest}
                    alt=""
                    width={12}
                    height={12}
                    className="h-3 w-3 shrink-0 object-contain"
                  />
                )}
                <span className="truncate">{player.club || "Free agent"}</span>
              </div>
              <div className={`${metaSize} truncate text-white/65`}>{player.league}</div>
              <div
                className={`${metaSize} flex items-center justify-center gap-1 text-white/65`}
              >
                {flag && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={flag}
                    alt=""
                    width={12}
                    height={8}
                    className="h-2 w-3 shrink-0 object-cover"
                  />
                )}
                <span className="truncate">{player.nationality}</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <span
              className={`${bebas.className} ${tokenSize} flex items-center justify-center rounded-full border-2 border-dashed text-sm tracking-wide transition ${
                selected
                  ? "border-white bg-white text-black"
                  : "border-white/40 bg-black/25 text-white/70 group-hover:border-white group-hover:text-white"
              }`}
            >
              {slot.code}
            </span>
            <span className={`${nameSize} font-medium text-white/35`}>
              {selected ? "Picking" : "Open"}
            </span>
          </>
        );

        const className = `group absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 ${
          href ? "cursor-pointer" : ""
        }`;
        const style = { left: `${slot.x}%`, top: `${slot.y}%` };

        return href ? (
          <Link key={slot.id} href={href} className={className} style={style}>
            {token}
          </Link>
        ) : (
          <div key={slot.id} className={className} style={style}>
            {token}
          </div>
        );
      })}
    </div>
  );
}
