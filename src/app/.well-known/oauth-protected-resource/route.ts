import { metadataCorsOptionsRequestHandler, protectedResourceHandler } from "mcp-handler";
import { getConfig } from "@/lib/config";

export const runtime = "nodejs";

/** RFC 9728 protected resource metadata: who authorizes /api/mcp. */
const handler = protectedResourceHandler({
  authServerUrls: [getConfig().appBaseUrl],
  resourceUrl: `${getConfig().appBaseUrl}/api/mcp`,
});

export { handler as GET };
export const OPTIONS = metadataCorsOptionsRequestHandler();
