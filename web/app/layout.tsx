import type { Metadata } from "next";
import Link from "next/link";
import Gem from "./Gem";
import { display } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ore",
  description: "Mine what's winning in paid social and turn it into ads.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={display.variable}>
      <body>
        <header className="top">
          <Link href="/" className="logo">
            <Gem kind="diamond" size={26} />
            <span className="logo-word">ORE</span>
          </Link>
          <span className="top-note">Mine what's winning</span>
        </header>
        {children}
      </body>
    </html>
  );
}
