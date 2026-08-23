import { createHash, randomBytes } from "node:crypto";
import type { Agent, PrismaClient } from "@/generated/prisma/client";
import { ApiError } from "@/lib/errors";

export interface RegisteredAgent {
  agent: Agent;
  /** Returned exactly once at registration; only the sha256 hash is stored. */
  apiKey: string;
  claimToken: string;
}

export class AgentService {
  constructor(private readonly db: PrismaClient) {}

  static hashKey(apiKey: string): string {
    return createHash("sha256").update(apiKey).digest("hex");
  }

  /**
   * @param options.claimed - Create the agent already human-claimed (used by
   * the OAuth screen, where a human is present and approving in the browser).
   */
  async register(
    name: string,
    options: { claimed?: boolean } = {},
  ): Promise<RegisteredAgent> {
    const apiKey = `ab_${randomBytes(24).toString("hex")}`;
    const claimToken = randomBytes(16).toString("hex");
    const agent = await this.db.agent.create({
      data: {
        name,
        apiKeyHash: AgentService.hashKey(apiKey),
        claimToken,
        ...(options.claimed ? { claimedAt: new Date() } : {}),
      },
    });
    return { agent, apiKey, claimToken };
  }

  /** Mark an agent claimed by id (no-op when already claimed). */
  async markClaimed(agentId: string): Promise<void> {
    await this.db.agent.updateMany({
      where: { id: agentId, claimedAt: null },
      data: { claimedAt: new Date() },
    });
  }

  /**
   * Resolve the agent holding an API key, or null. The presented key is hashed
   * and looked up by its unique hash — the raw key is never stored or logged.
   */
  async byApiKey(apiKey: string): Promise<Agent | null> {
    return this.db.agent.findUnique({
      where: { apiKeyHash: AgentService.hashKey(apiKey) },
    });
  }

  /** Resolve the agent for a bearer Authorization header, throwing 401s. */
  async authenticate(authorizationHeader: string | null): Promise<Agent> {
    const match = authorizationHeader?.match(/^Bearer\s+(\S+)$/i);
    if (!match) {
      throw new ApiError(
        401,
        "missing_api_key",
        "Send your agent API key as: Authorization: Bearer <apiKey>. Register at POST /api/v1/agents/register.",
      );
    }
    const agent = await this.byApiKey(match[1]);
    if (!agent) {
      throw new ApiError(401, "invalid_api_key", "Unknown API key. Register at POST /api/v1/agents/register.");
    }
    return agent;
  }

  /** Mark an agent as human-claimed via its claim token. */
  async claim(claimToken: string): Promise<Agent> {
    const agent = await this.db.agent.findUnique({ where: { claimToken } });
    if (!agent) {
      throw new ApiError(404, "invalid_claim_token", "This claim link is not valid.");
    }
    if (agent.claimedAt) return agent;
    return this.db.agent.update({
      where: { id: agent.id },
      data: { claimedAt: new Date() },
    });
  }
}
