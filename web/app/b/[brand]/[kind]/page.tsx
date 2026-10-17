import { notFound } from "next/navigation";
import DocIndex from "@/app/DocIndex";

export const dynamic = "force-dynamic";

export default async function Docs({ params }: { params: Promise<{ brand: string; kind: string }> }) {
  const { brand, kind } = await params;
  if (kind !== "scripts" && kind !== "briefs") notFound();
  return <DocIndex brand={brand} kind={kind} />;
}
