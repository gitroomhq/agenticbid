import Link from "next/link";

function RobotMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {/* antenna */}
      <line x1="12" y1="3" x2="12" y2="7" />
      <circle cx="12" cy="2.5" r="1" fill="currentColor" stroke="none" />
      {/* head */}
      <rect x="4" y="7" width="16" height="12" rx="3.5" />
      {/* ears */}
      <line x1="1.5" y1="12" x2="1.5" y2="14" />
      <line x1="22.5" y1="12" x2="22.5" y2="14" />
      {/* eyes */}
      <circle cx="9" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1.4" fill="currentColor" stroke="none" />
      {/* mouth */}
      <line x1="9" y1="16" x2="15" y2="16" />
    </svg>
  );
}

export function SiteHeader() {
  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between px-6 pt-6">
      <Link href="/" className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
        <RobotMark className="size-6 text-accent" />
        <span>
          agenticbid<span className="text-accent">.lol</span>
        </span>
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
