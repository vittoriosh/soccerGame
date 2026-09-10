import Link from "next/link";
import { PACK_TIERS, STARTING_CASH } from "@/lib/packs";
import { StadiumShell } from "@/components/stadium-shell";
import { bebas } from "@/lib/game-fonts";
import { startPackRun } from "./actions";

export default function PacksLandingPage() {
  return (
    <StadiumShell align="center">
      <div className="flex w-full max-w-2xl flex-col items-center text-center">
        <div className="home-fade-in w-full">
          <p className={`${bebas.className} text-sm tracking-[0.35em] text-white/55`}>
            Alternate Mode
          </p>
          <h1 className={`${bebas.className} mt-2 text-5xl tracking-wide text-white sm:text-6xl`}>
            Packs
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm text-white/55">
            Build a starting XI from card packs. ${STARTING_CASH.toLocaleString()} cash — spend it
            wisely.
          </p>

          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {PACK_TIERS.map((tier) => (
              <div
                key={tier.key}
                className="border-2 border-white/35 bg-black/55 px-3 py-5 text-white"
              >
                <div className={`${bebas.className} text-2xl tracking-wide`}>{tier.name.replace(" Pack", "")}</div>
                <div className="mt-2 text-sm font-semibold text-white/80">
                  ${tier.price.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/"
            className={`${bebas.className} border-2 border-white/60 bg-black/55 px-10 py-5 text-3xl tracking-[0.12em] text-white transition hover:border-white`}
          >
            Menu
          </Link>
          <form action={startPackRun}>
            <button
              type="submit"
              className={`${bebas.className} border-2 border-white bg-white px-12 py-5 text-3xl tracking-[0.12em] text-black transition hover:bg-transparent hover:text-white`}
            >
              Start Squad →
            </button>
          </form>
        </div>

        <Link
          href="/packs/demo"
          className={`${bebas.className} mt-6 text-lg tracking-[0.16em] text-white/45 transition hover:text-white`}
        >
          Card designs demo
        </Link>
      </div>
    </StadiumShell>
  );
}
