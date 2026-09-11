import type { ReactNode } from "react";
import { barlow } from "@/lib/game-fonts";

export function StadiumShell({
  children,
  animateBackground = false,
  align = "start",
  scrollable = false,
  fill = false,
}: {
  children: ReactNode;
  animateBackground?: boolean;
  align?: "start" | "center";
  /** Allow the page to scroll — used by the live draft board. */
  scrollable?: boolean;
  /** Lock to the viewport — used by the in-progress draft HUD. */
  fill?: boolean;
}) {
  const overlay =
    align === "center"
      ? "bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.72)_0%,rgba(0,0,0,0.55)_45%,rgba(0,0,0,0.35)_100%)]"
      : scrollable
        ? "bg-[radial-gradient(ellipse_at_top,rgba(0,0,0,0.55)_0%,rgba(0,0,0,0.72)_55%,rgba(0,0,0,0.82)_100%)]"
        : "bg-[linear-gradient(105deg,rgba(0,0,0,0.78)_0%,rgba(0,0,0,0.45)_42%,rgba(0,0,0,0.2)_100%)]";

  return (
    <div
      className={`${barlow.className} relative flex min-h-dvh flex-1 flex-col text-white ${
        fill
          ? "h-dvh min-h-0 overflow-hidden"
          : "overflow-x-hidden overflow-y-auto overscroll-y-contain"
      }`}
    >
      <div
        aria-hidden
        className={`pointer-events-none fixed inset-0 bg-cover bg-center bg-no-repeat ${
          animateBackground ? "home-bg-pan" : "scale-[1.08]"
        }`}
        style={{ backgroundImage: "url(/soccer-game-background.jpeg)" }}
      />
      <div aria-hidden className={`pointer-events-none fixed inset-0 ${overlay}`} />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/50"
      />
      <div
        className={`relative z-10 flex w-full flex-col ${
          align === "center"
            ? "min-h-full items-center px-4 py-[max(1.5rem,env(safe-area-inset-top))] sm:px-6"
            : fill
              ? "min-h-0 flex-1 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6"
              : scrollable
                ? "px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-8 lg:px-10"
                : ""
        }`}
      >
        {align === "center" ? (
          <div className="my-auto flex w-full flex-col items-center">{children}</div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
