import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ore",
  description: "Find what's winning in paid social and turn it into ads.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <Link href="/" className="logo">
            Ore
          </Link>
        </header>
        {children}
      </body>
    </html>
  );
}
