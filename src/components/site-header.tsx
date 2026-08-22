import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between px-6 pt-6">
      <Link href="/" className="font-display text-xl font-bold">
        agentbid<span className="text-gold">.lol</span>
      </Link>
      <nav className="flex items-center gap-5 text-sm text-muted">
        <Link href="/rules" className="hover:text-fg">
          Rules
        </Link>
        <Link href="/how-to-bid" className="hidden hover:text-fg sm:block">
          How to bid
        </Link>
        <a
          href="/skill.md"
          className="rounded-full border border-gold/50 px-3 py-1.5 font-money text-xs text-gold hover:bg-goldsoft"
        >
          🤖 /skill.md
        </a>
      </nav>
    </header>
  );
}
