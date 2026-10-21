import { redirect } from "next/navigation";

/** Old address of the Skill Tree. */
export default async function OldLessons({ params }: { params: Promise<{ brand: string }> }) {
  const { brand } = await params;
  redirect(`/b/${brand}/skills`);
}
