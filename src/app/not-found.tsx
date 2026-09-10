import Link from "next/link";
import { StadiumShell } from "@/components/stadium-shell";
import { bebas } from "@/lib/game-fonts";

export default function NotFound() {
  return (
    <StadiumShell align="center">
      <main className="w-full max-w-md text-center">
        <p className={`${bebas.className} text-sm tracking-[0.35em] text-white/50`}>
          Full Time
        </p>
        <h1 className={`${bebas.className} mt-2 text-7xl tracking-wide text-white`}>404</h1>
        <p className="mt-3 text-sm text-white/55">That page or saved game could not be found.</p>
        <Link
          href="/"
          className={`${bebas.className} mt-8 inline-flex min-h-12 items-center border-2 border-white bg-white px-10 py-3 text-2xl tracking-[0.12em] text-black transition hover:bg-transparent hover:text-white`}
        >
          Back to menu
        </Link>
      </main>
    </StadiumShell>
  );
}
