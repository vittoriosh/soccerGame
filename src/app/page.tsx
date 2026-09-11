import Link from "next/link";
import { StadiumShell } from "@/components/stadium-shell";
import { bebas } from "@/lib/game-fonts";

const menuLinks = [
  { href: "/how-to-play", label: "How To Play" },
  { href: "/players", label: "Players" },
  { href: "/draft", label: "Career & Custom Game" },
  { href: "/leaderboard", label: "Leaderboard" },
] as const;

export default function Home() {
  return (
    <StadiumShell animateBackground>
      <div className="flex w-full max-w-xl flex-col justify-center px-8 py-16 sm:px-14 lg:px-20">
        <p
          className={`${bebas.className} home-fade-in text-sm tracking-[0.45em] text-white/55`}
          style={{ animationDelay: "40ms" }}
        >
          CAREER MODE
        </p>
        <h1
          className={`${bebas.className} home-fade-in mt-3 text-6xl leading-[0.9] tracking-wide sm:text-7xl lg:text-8xl`}
          style={{ animationDelay: "120ms" }}
        >
          Matchday
          <br />
          Manager
        </h1>

        <Link
          href="/draft"
          className={`${bebas.className} home-fade-in group mt-12 inline-flex w-fit items-center gap-4 border-2 border-white bg-white px-12 py-5 text-3xl tracking-[0.12em] text-black transition duration-300 hover:bg-transparent hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:px-14 sm:py-6 sm:text-4xl`}
          style={{ animationDelay: "220ms" }}
        >
          Start Game
          <span
            aria-hidden
            className="translate-x-0 text-2xl transition duration-300 group-hover:translate-x-1.5 sm:text-3xl"
          >
            →
          </span>
        </Link>

        <nav
          aria-label="Main menu"
          className="home-fade-in mt-14 flex flex-col gap-1 border-l border-white/20 pl-5"
          style={{ animationDelay: "320ms" }}
        >
          {menuLinks.map((item, index) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${bebas.className} group relative py-2.5 text-2xl tracking-[0.18em] text-white/55 transition duration-200 hover:pl-3 hover:text-white sm:text-3xl`}
              style={{ transitionDelay: `${index * 20}ms` }}
            >
              <span
                aria-hidden
                className="absolute top-1/2 -left-5 h-0 w-0.5 -translate-y-1/2 bg-white transition-all duration-200 group-hover:h-5"
              />
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </StadiumShell>
  );
}
