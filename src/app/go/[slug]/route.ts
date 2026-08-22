import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api";
import { getServices } from "@/lib/services";

export const runtime = "nodejs";

export const GET = withErrorHandling(
  async (_request: Request, context: { params: Promise<{ slug: string }> }) => {
    const { slug } = await context.params;
    const { listings } = getServices();
    const targetUrl = await listings.recordClick(slug);
    // 302 with no tracking params added — the URL is stored pre-normalized
    return NextResponse.redirect(targetUrl, { status: 302 });
  },
);
