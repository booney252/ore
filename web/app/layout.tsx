import type { Metadata } from "next";
import { body, data, display } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ore",
  description: "Mine what's winning in paid social and turn it into ads.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${data.variable}`}>
      <body>
        <div className="grain" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
