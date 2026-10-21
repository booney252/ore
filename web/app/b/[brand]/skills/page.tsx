import { redirect } from "next/navigation";

/** The old Skill Tree: a brand's rules now live in the Research page's "What Ore learned" tab. */
export default async function OldSkills({ params }: { params: Promise<{ brand: string }> }) {
  const { brand } = await params;
  redirect(`/b/${brand}/research?step=learned`);
}
