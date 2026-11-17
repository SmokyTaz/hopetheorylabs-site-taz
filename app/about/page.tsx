import { About } from "@/components/About";
import { SubpageShell } from "@/components/SubpageShell";
import { ROUTES } from "@/lib/metadata";

export const metadata = ROUTES.about;

export default function AboutPage() {
  return (
    <SubpageShell>
      <About headingLevel={1} />
    </SubpageShell>
  );
}
