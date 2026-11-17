import { PricingSection } from "@/components/PricingSection";
import { SubpageShell } from "@/components/SubpageShell";
import { ROUTES } from "@/lib/metadata";

export const metadata = ROUTES.pricing;

export default function PricingPage() {
  return (
    <SubpageShell>
      <PricingSection headingLevel={1} />
    </SubpageShell>
  );
}
