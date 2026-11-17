import { FeatureGrid } from "@/components/FeatureGrid";
import { SubpageShell } from "@/components/SubpageShell";
import { ROUTES } from "@/lib/metadata";

export const metadata = ROUTES.services;

export default function ServicesPage() {
  return (
    <SubpageShell>
      <FeatureGrid headingLevel={1} />
    </SubpageShell>
  );
}
