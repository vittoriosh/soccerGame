"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-neutral-950 px-5 py-10 text-white">
      <div className="w-full max-w-md border border-white/20 bg-white/5 p-6 text-center sm:p-8">
        <p className="text-xs tracking-[0.28em] text-white/45 uppercase">Matchday interrupted</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight">Something went wrong</h1>
        <p className="mt-3 text-sm leading-relaxed text-white/55">
          Your saved draft is safe. Try this screen again or return to the menu.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="min-h-11 border-2 border-white bg-white px-6 py-3 font-bold text-black transition hover:bg-transparent hover:text-white"
          >
            Try again
          </button>
          <Link
            href="/"
            className="min-h-11 border-2 border-white/40 px-6 py-3 font-bold text-white transition hover:border-white"
          >
            Menu
          </Link>
        </div>
        {error.digest && <p className="mt-5 text-[10px] text-white/25">Reference {error.digest}</p>}
      </div>
    </main>
  );
}
