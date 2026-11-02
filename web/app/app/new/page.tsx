import { requireOwner } from "@/lib/session";
import { Logo } from "../ui";
import Onboard from "./Onboard";

export const dynamic = "force-dynamic";

export default async function NewBrand({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireOwner();
  const q = await searchParams;
  const error = q.missing ? "Add a brand name and a line about what you sell." : q.taken ? `A brand called ${q.taken} already exists.` : undefined;
  return (
    <header className="oa-band full">
      <div className="oa-wrap">
        <nav className="oa-nav">
          <Logo />
        </nav>
        <Onboard error={error} />
      </div>
    </header>
  );
}
