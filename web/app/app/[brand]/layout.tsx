import { notFound } from "next/navigation";
import { brandExists, checkSlug } from "@/lib/brands";
import { requireBrand } from "@/lib/session";

export default async function BrandLayout({ children, params }: { children: React.ReactNode; params: Promise<{ brand: string }> }) {
  const { brand } = await params;
  try {
    checkSlug(brand);
  } catch {
    notFound();
  }
  await requireBrand(brand);
  if (!(await brandExists(brand))) notFound();
  return <>{children}</>;
}
