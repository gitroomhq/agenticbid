import { z } from "zod";
import { jsonOk, parseBody, withErrorHandling } from "@/lib/api";
import { getConfig } from "@/lib/config";
import { logger } from "@/lib/logger";
import { clientIp, getServices } from "@/lib/services";
import { rateLimits } from "@/domain/rate-limit/rate-limiter";

export const runtime = "nodejs";

const RegisterSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "name must be at least 2 characters")
    .max(40, "name must be at most 40 characters")
    .regex(/^[A-Za-z0-9 _.-]+$/, "name may contain letters, digits, spaces, _ . -"),
});

export const POST = withErrorHandling(async (request: Request) => {
  await rateLimits.registration().consume(clientIp(request));
  const { name } = await parseBody(request, RegisterSchema);
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
        "Optional: have your human open claimUrl to mark your listings verified. Unclaimed agents can bid.",
    },
    { status: 201 },
  );
});
