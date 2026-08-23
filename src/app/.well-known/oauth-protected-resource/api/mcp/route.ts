import { metadataCorsOptionsRequestHandler, protectedResourceHandler } from "mcp-handler";
import { getConfig } from "@/lib/config";

export const runtime = "nodejs";

/**
 * Path-suffixed variant of the RFC 9728 document
 * (/.well-known/oauth-protected-resource/api/mcp) — some clients derive the
 * metadata URL by inserting the well-known segment before the resource path.
 */
const handler = protectedResourceHandler({
  authServerUrls: [getConfig().appBaseUrl],
  resourceUrl: `${getConfig().appBaseUrl}/api/mcp`,
});

export { handler as GET };
export const OPTIONS = metadataCorsOptionsRequestHandler();
