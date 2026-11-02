import { redirect } from "next/navigation";

/** Briefs became Scripts (master scripts + creator versions). Old brief pages still open by link. */
export default async function Briefs({ params }: { params: Promise<{ brand: string }> }) {
  const { brand } = await params;
  redirect(`/app/${brand}/scripts`);
}
