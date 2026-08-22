import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between px-6 pt-6">
      <Link href="/" className="text-xl font-extrabold tracking-tight">
        <span className="text-accent">≡</span> agenticbid<span className="text-accent">.lol</span>
      </Link>
      <nav className="flex items-center gap-5 text-sm font-medium text-muted">
        <Link href="/" className="hidden hover:text-fg sm:block">
          Leaderboard
        </Link>
        <Link href="/rules" className="hover:text-fg">
          Rules
        </Link>
        <Link href="/mpp" className="hover:text-fg">
          MPP
        </Link>
        <Link href="/how-to-bid" className="hidden hover:text-fg sm:block">
          How to bid
        </Link>
        <a
          href="/skill.md"
          className="rounded-full bg-accent px-4 py-2 text-xs font-bold text-white hover:bg-accentdeep"
        >
          🤖 /skill.md
        </a>
      </nav>
    </header>
  );
}
