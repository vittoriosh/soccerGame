import { clubLogoSrc } from "@/lib/player-image";

type CoachInfo = {
  name: string;
  club: string;
  clubId: number | null;
  rating: number;
};

export function CoachCard({ coach }: { coach: CoachInfo | null }) {
  if (!coach) {
    return (
      <div className="flex items-center justify-center border-2 border-dashed border-white/25 bg-black/30 px-4 py-3 text-sm text-white/45">
        No coach yet
      </div>
    );
  }

  const crest = clubLogoSrc(coach.clubId, 60);

  return (
    <div className="flex items-center gap-3 border-2 border-white/35 bg-black/50 px-3 py-2.5">
      <div className="text-xl font-black leading-none text-white">{coach.rating}</div>
      {crest && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={crest}
          alt=""
          width={28}
          height={28}
          className="h-7 w-7 shrink-0 object-contain"
        />
      )}
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-white">{coach.name}</div>
        <div className="truncate text-xs text-white/55">Coach · {coach.club}</div>
      </div>
    </div>
  );
}
