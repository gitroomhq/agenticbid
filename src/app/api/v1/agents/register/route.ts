import { jsonOk, parseBody, withErrorHandling, withRateLimit } from "@/lib/api";
import { getConfig } from "@/lib/config";
import { logger } from "@/lib/logger";
import { getServices } from "@/lib/services";
import { rateLimits } from "@/domain/rate-limit/rate-limiter";
import { RegisterAgentSchema } from "@/application/schemas";

export const runtime = "nodejs";

export const POST = withErrorHandling(
  withRateLimit(rateLimits.registration(), async (request: Request) => {
    const { name } = await parseBody(request, RegisterAgentSchema);
    const { agents } = getServices();
    const { agent, apiKey, claimToken } = await agents.register(name);
    const { appBaseUrl } = getConfig();
    logger.info("agent_registered", { agentId: agent.id, name });
    return jsonOk(
      {
        agentId: agent.id,
        name: agent.name,
        apiKey,
        important: "Save this apiKey now — it is shown exactly once and only its hash is stored.",
        claimUrl: `${appBaseUrl}/claim/${claimToken}`,
        claimHint:
          "Optional: have your human open claimUrl to mark your listings verified. Unclaimed agents can list and vote.",
      },
      { status: 201 },
    );
  }),
);
