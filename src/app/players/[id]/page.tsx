import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { playerImageSrc, clubLogoSrc } from "@/lib/player-image";
import { flagUrl } from "@/lib/country-flags";
import { formatEur } from "@/lib/format";
import { cardTierAccentBorderClass } from "@/lib/card-tier";
import { StadiumShell } from "@/components/stadium-shell";
import { bebas } from "@/lib/game-fonts";

export const dynamic = "force-dynamic";

function StatBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-24 shrink-0 text-white/50 sm:w-36">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden bg-white/10">
        <div className="h-full bg-white" style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span className="w-6 shrink-0 text-right font-semibold text-white">{value}</span>
    </div>
  );
}

function StatGroup({
  title,
  stats,
}: {
  title: string;
  stats: { label: string; value: number }[];
}) {
  if (stats.every((s) => s.value === 0)) return null;
  return (
    <div className="border border-white/15 bg-black/40 p-4">
      <h3 className={`${bebas.className} text-lg tracking-wide text-white/80`}>{title}</h3>
      <div className="mt-3 space-y-2">
        {stats.map((s) => (
          <StatBar key={s.label} label={s.label} value={s.value} />
        ))}
      </div>
    </div>
  );
}

export default async function PlayerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const player = await prisma.player.findUnique({
    where: { id: Number.parseInt(id, 10) },
  });

  if (!player) notFound();

  const mainStats = [
    { label: "Pace", value: player.pace },
    { label: "Shooting", value: player.shooting },
    { label: "Passing", value: player.passing },
    { label: "Dribbling", value: player.dribbling },
    { label: "Defending", value: player.defending },
    { label: "Physical", value: player.physic },
  ];

  const tierRing = cardTierAccentBorderClass(player.overall, "border-white/25");
  const crest = clubLogoSrc(player.clubId, 60);
  const flag = flagUrl(player.nationality);

  return (
    <StadiumShell scrollable>
      <main className="mx-auto w-full max-w-5xl pb-12">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/players"
            className={`${bebas.className} text-lg tracking-[0.16em] text-white/55 transition hover:text-white`}
          >
            ← Players
          </Link>
          <Link
            href="/"
            className={`${bebas.className} border border-white/40 bg-black/40 px-5 py-2.5 text-lg tracking-wide text-white transition hover:border-white hover:bg-white hover:text-black`}
          >
            Menu
          </Link>
        </div>

        <div className="mt-6 flex flex-col items-center gap-5 bg-black/45 p-4 text-center backdrop-blur-sm sm:flex-row sm:items-start sm:gap-6 sm:p-5 sm:text-left">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={playerImageSrc(player.imageUrl)}
            alt={player.name}
            width={120}
            height={120}
            className={`h-[120px] w-[120px] rounded-full border-2 bg-black/40 object-cover ${tierRing}`}
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-3">
              <h1 className={`${bebas.className} text-5xl tracking-wide text-white`}>
                {player.name}
              </h1>
              <span className={`${bebas.className} border-2 border-white bg-white px-3 py-1 text-3xl leading-none text-black`}>
                {player.overall}
              </span>
              <span className="text-sm text-white/45">POT {player.potential}</span>
            </div>
            <p className="mt-1 text-sm text-white/50">{player.fullName}</p>

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/70">
              <span className="font-semibold text-white">{player.positions}</span>
              <span className="inline-flex items-center gap-1.5">
                {crest && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={crest} alt="" width={18} height={18} className="h-[18px] w-[18px] object-contain" />
                )}
                {player.club || "Free agent"}
              </span>
              <span>{player.league}</span>
              <span className="inline-flex items-center gap-1.5">
                {flag && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={flag} alt="" width={16} height={11} className="h-2.5 w-4 object-cover" />
                )}
                {player.nationality}
              </span>
              <span>’{String(player.year).slice(-2)}</span>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
              {[
                ["Age", `${player.age} (${player.dob})`],
                ["Height", `${player.heightCm} cm`],
                ["Weight", `${player.weightKg} kg`],
                ["Foot", player.preferredFoot],
                ["Weak Foot", "★".repeat(player.weakFoot)],
                ["Skills", "★".repeat(player.skillMoves)],
                ["Work Rate", player.workRate],
                ["Value", formatEur(player.valueEur)],
                ["Wage / week", formatEur(player.wageEur)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-white/40">{label}</dt>
                  <dd className="text-white">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <StatGroup title="Main Attributes" stats={mainStats} />
          <StatGroup
            title="Attacking"
            stats={[
              { label: "Crossing", value: player.attackingCrossing },
              { label: "Finishing", value: player.attackingFinishing },
              { label: "Heading Accuracy", value: player.attackingHeadingAccuracy },
              { label: "Short Passing", value: player.attackingShortPassing },
              { label: "Volleys", value: player.attackingVolleys },
            ]}
          />
          <StatGroup
            title="Skill"
            stats={[
              { label: "Dribbling", value: player.skillDribbling },
              { label: "Curve", value: player.skillCurve },
              { label: "FK Accuracy", value: player.skillFkAccuracy },
              { label: "Long Passing", value: player.skillLongPassing },
              { label: "Ball Control", value: player.skillBallControl },
            ]}
          />
          <StatGroup
            title="Movement"
            stats={[
              { label: "Acceleration", value: player.movementAcceleration },
              { label: "Sprint Speed", value: player.movementSprintSpeed },
              { label: "Agility", value: player.movementAgility },
              { label: "Reactions", value: player.movementReactions },
              { label: "Balance", value: player.movementBalance },
            ]}
          />
          <StatGroup
            title="Power"
            stats={[
              { label: "Shot Power", value: player.powerShotPower },
              { label: "Jumping", value: player.powerJumping },
              { label: "Stamina", value: player.powerStamina },
              { label: "Strength", value: player.powerStrength },
              { label: "Long Shots", value: player.powerLongShots },
            ]}
          />
          <StatGroup
            title="Mentality"
            stats={[
              { label: "Aggression", value: player.mentalityAggression },
              { label: "Interceptions", value: player.mentalityInterceptions },
              { label: "Positioning", value: player.mentalityPositioning },
              { label: "Vision", value: player.mentalityVision },
              { label: "Penalties", value: player.mentalityPenalties },
              { label: "Composure", value: player.mentalityComposure },
            ]}
          />
          <StatGroup
            title="Defending"
            stats={[
              { label: "Marking Awareness", value: player.defendingMarkingAwareness },
              { label: "Standing Tackle", value: player.defendingStandingTackle },
              { label: "Sliding Tackle", value: player.defendingSlidingTackle },
            ]}
          />
          <StatGroup
            title="Goalkeeping"
            stats={[
              { label: "Diving", value: player.goalkeepingDiving },
              { label: "Handling", value: player.goalkeepingHandling },
              { label: "Kicking", value: player.goalkeepingKicking },
              { label: "Positioning", value: player.goalkeepingPositioning },
              { label: "Reflexes", value: player.goalkeepingReflexes },
            ]}
          />
        </div>
      </main>
    </StadiumShell>
  );
}
