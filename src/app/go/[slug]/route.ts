import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";

/**
 * Outbound clicks carry UTM attribution so target sites can see the traffic
 * comes from bidding. Stored target URLs are normalized (query params
 * stripped at submission), so these are always the only params.
 */
function withUtm(targetUrl: string, slug: string): string {
  const url = new URL(targetUrl);
  url.searchParams.set("utm_source", "bidding.dev");
  url.searchParams.set("utm_medium", "referral");
  url.searchParams.set("utm_campaign", "leaderboard");
  url.searchParams.set("utm_content", slug);
  return url.toString();
}

export const GET = withErrorHandling(
  async (_request: Request, context: { params: Promise<{ slug: string }> }) => {
    const { slug } = await context.params;
    const { listings } = getServices();
    const targetUrl = await listings.recordClick(slug);
    return NextResponse.redirect(withUtm(targetUrl, slug), { status: 302 });
  },
);
