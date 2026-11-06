import type { Metadata } from "next";
import "./ore-app.css";

export const metadata: Metadata = { title: "Ore" };

/** The customer-facing app. Separate look and routes from the owner site (/b/...). */
export default function OreAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="oa">
      {/* night mode before first paint: the saved choice, else the device setting */}
      <script
        dangerouslySetInnerHTML={{
          __html: `try{var t=localStorage.getItem("ore-theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){}`,
        }}
      />
      {children}
    </div>
  );
}
