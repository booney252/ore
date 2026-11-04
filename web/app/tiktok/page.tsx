import { notFound, redirect } from "next/navigation";
import { tiktokBrand } from "@/lib/tiktok";

export const dynamic = "force-dynamic";

/** /tiktok: straight to the TikTok Shop brand's daily page. */
export default async function TiktokShortcut() {
  const brand = await tiktokBrand();
  if (!brand) notFound();
  redirect(`/app/${brand}/tiktok`);
}
