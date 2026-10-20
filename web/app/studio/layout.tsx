import Link from "next/link";
import LogOut from "@/app/LogOut";
import Wordmark from "@/app/Wordmark";

/** Creator Studio: the creator-facing side of Ore. Its own simple frame, no brand sidebar. */
export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="home-wrap studio-wrap">
      <header className="home-top studio-top">
        <div className="studio-brand">
          <Wordmark />
          <span className="studio-badge mono">Creator Studio</span>
        </div>
        <nav className="studio-nav">
          <Link href="/studio">Brands</Link>
          <Link href="/studio/me">My profile</Link>
          <LogOut />
        </nav>
      </header>
      {children}
    </div>
  );
}
