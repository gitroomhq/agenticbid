export function formatVotes(votes: number): string {
  return `▲ ${votes.toLocaleString("en-US")}`;
}

export function timeAgo(iso: string | Date): string {
  const then = typeof iso === "string" ? new Date(iso) : iso;
  const seconds = Math.max(1, Math.floor((Date.now() - then.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
