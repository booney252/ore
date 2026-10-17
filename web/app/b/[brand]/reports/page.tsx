import DocIndex from "@/app/DocIndex";

export const dynamic = "force-dynamic";

export default async function Reports({ params }: { params: Promise<{ brand: string }> }) {
  return <DocIndex brand={(await params).brand} kind="reports" />;
}
