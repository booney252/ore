import type { Metadata } from "next";
import "./ore-app.css";

export const metadata: Metadata = { title: "Ore" };

/** The customer-facing app. Separate look and routes from the owner site (/b/...). */
export default function OreAppLayout({ children }: { children: React.ReactNode }) {
  return <div className="oa">{children}</div>;
}
