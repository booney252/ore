"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-checks the research every 15 seconds so the page moves on by itself. */
export default function Refresh() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 15000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}
