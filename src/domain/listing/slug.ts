import type { PrismaClient } from "@/generated/prisma/client";

/** Derive a URL-safe slug from a title, e.g. "My Product!" -> "my-product". */
export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^@/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "listing";
}

/** Find a slug that is free in the Listing table, suffixing -2, -3, ... */
export async function uniqueSlug(db: PrismaClient, title: string): Promise<string> {
  const base = slugify(title);
  const taken = await db.listing.findMany({
    where: { slug: { startsWith: base } },
    select: { slug: true },
  });
  const existing = new Set(taken.map((row) => row.slug));
  if (!existing.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!existing.has(candidate)) return candidate;
  }
}
