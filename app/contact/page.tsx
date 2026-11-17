import { Contact } from "@/components/Contact";
import { SubpageShell } from "@/components/SubpageShell";
import { ROUTES } from "@/lib/metadata";

export const metadata = ROUTES.contact;

export default function ContactPage() {
  return (
    <SubpageShell>
      <Contact headingLevel={1} />
    </SubpageShell>
  );
}
