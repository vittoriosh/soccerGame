import { StadiumShell } from "@/components/stadium-shell";
import { HowToPlayFlow } from "@/components/how-to-play-flow";

export const metadata = {
  title: "How To Play",
};

export default function HowToPlayPage() {
  return (
    <StadiumShell align="center" scrollable>
      <HowToPlayFlow />
    </StadiumShell>
  );
}
