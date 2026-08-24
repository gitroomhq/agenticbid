import { createHash } from "node:crypto";
import { z } from "zod";
import type { AppConfig } from "@/lib/config";
import { ApiError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { AgentService } from "@/domain/agent/agent-service";
import { OAuthRequestError, OAuthTokenError } from "@/domain/oauth/errors";
import type { AuthCodeService } from "@/domain/oauth/auth-code-service";
import {
  isAcceptableRedirectUri,
  redirectUriMatches,
  type OAuthClientRegistry,
} from "@/domain/oauth/client-registry";
import { RegisterAgentSchema } from "@/application/schemas";

/** A validated /oauth/authorize request, ready to render or approve. */
export interface AuthorizeRequest {
  clientId: string;
  clientName?: string;
  redirectUri: string;
  state?: string;
  codeChallenge: string;
  scope?: string;
  resource?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: "bearer";
  scope: string;
}

const DcrSchema = z.looseObject({
  redirect_uris: z.array(z.string().min(1).max(2000)).min(1).max(10),
  client_name: z.string().max(200).optional(),
});

/**
 * Application layer for the OAuth authorization server that fronts the MCP
 * endpoint. The consent screen doubles as agent signup: approving creates the
 * agent (human present in the browser → auto-claimed/verified), and the
 * issued access token is the agent's apiKey, so the existing bearer
 * verification works for OAuth and hand-held keys alike.
 */
export class OAuthService {
  constructor(
    private readonly agents: AgentService,
    private readonly clients: OAuthClientRegistry,
    private readonly codes: AuthCodeService,
    private readonly config: AppConfig,
  ) {}

  /** RFC 7591 dynamic client registration. Stateless — nothing stored. */
  registerClient(body: unknown): Record<string, unknown> {
    const parsed = DcrSchema.safeParse(body);
    if (!parsed.success) {
      throw new OAuthTokenError(
        400,
        "invalid_client_metadata",
        `redirect_uris: ${parsed.error.issues[0]?.message ?? "invalid"}`,
      );
    }
    const bad = parsed.data.redirect_uris.find((uri) => !isAcceptableRedirectUri(uri));
    if (bad) {
      throw new OAuthTokenError(
        400,
        "invalid_redirect_uri",
        `Redirect URIs must be https (or http on localhost); got "${bad}".`,
      );
    }
    const client = this.clients.register({
      redirectUris: parsed.data.redirect_uris,
      name: parsed.data.client_name,
    });
    return {
      client_id: client.clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: client.redirectUris,
      client_name: client.name,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
    };
  }

  /** Validate an authorize request; throws OAuthRequestError (render vs redirect). */
  parseAuthorizeRequest(query: Record<string, string | undefined>): AuthorizeRequest {
    const clientId = query.client_id;
    const redirectUri = query.redirect_uri;
    if (!clientId) throw new OAuthRequestError("invalid_request", "client_id is required.");
    const client = this.clients.resolve(clientId);
    if (!client) {
      throw new OAuthRequestError(
        "invalid_client",
        "Unknown client_id. Register the client first: POST /oauth/register.",
      );
    }
    if (!redirectUri) throw new OAuthRequestError("invalid_request", "redirect_uri is required.");
    if (!client.redirectUris.some((registered) => redirectUriMatches(registered, redirectUri))) {
      throw new OAuthRequestError(
        "invalid_request",
        "redirect_uri is not registered for this client.",
      );
    }
    // From here the client and redirect are trusted → errors go via redirect.
    const redirect = { uri: redirectUri, state: query.state };
    if (query.response_type !== "code") {
      throw new OAuthRequestError(
        "unsupported_response_type",
        "Only response_type=code is supported.",
        redirect,
      );
    }
    if (!query.code_challenge) {
      throw new OAuthRequestError("invalid_request", "PKCE code_challenge is required.", redirect);
    }
    if ((query.code_challenge_method ?? "S256") !== "S256") {
      throw new OAuthRequestError(
        "invalid_request",
        "Only code_challenge_method=S256 is supported.",
        redirect,
      );
    }
    return {
      clientId,
      clientName: client.name,
      redirectUri,
      state: query.state || undefined,
      codeChallenge: query.code_challenge,
      scope: query.scope || undefined,
      resource: query.resource || undefined,
    };
  }

  /** Approve by creating a brand-new agent (the screen IS the signup form). */
  async approveWithNewAgent(request: AuthorizeRequest, name: string): Promise<URL> {
    const parsed = RegisterAgentSchema.safeParse({ name });
    if (!parsed.success) {
      throw new ApiError(400, "invalid_name", parsed.error.issues[0].message);
    }
    // A human approved this in their browser — that is exactly what claiming
    // verifies, so OAuth-born agents start out claimed.
    const { agent, apiKey } = await this.agents.register(parsed.data.name, { claimed: true });
    logger.info("agent_registered_oauth", { agentId: agent.id, clientId: request.clientId });
    return this.grant(request, agent.id, apiKey);
  }

  /** Approve by connecting an agent that already has an apiKey. */
  async approveWithExistingKey(request: AuthorizeRequest, apiKey: string): Promise<URL> {
    const key = apiKey.trim();
    const agent = await this.agents.byApiKey(key);
    if (!agent) {
      throw new ApiError(
        401,
        "invalid_api_key",
        "Unknown API key — check it, or leave the field empty to create a new agent.",
      );
    }
    await this.agents.markClaimed(agent.id);
    return this.grant(request, agent.id, key);
  }

  /** RFC 6749 token endpoint: authorization_code + PKCE → bearer apiKey. */
  exchange(form: Record<string, string | undefined>): TokenResponse {
    if (form.grant_type !== "authorization_code") {
      throw new OAuthTokenError(
        400,
        "unsupported_grant_type",
        "Only grant_type=authorization_code is supported.",
      );
    }
    if (!form.code || !form.code_verifier) {
      throw new OAuthTokenError(400, "invalid_request", "code and code_verifier are required.");
    }
    const grant = this.codes.redeem(form.code);
    if (form.client_id && form.client_id !== grant.clientId) {
      throw new OAuthTokenError(400, "invalid_grant", "client_id does not match this code.");
    }
    if (form.redirect_uri && form.redirect_uri !== grant.redirectUri) {
      throw new OAuthTokenError(400, "invalid_grant", "redirect_uri does not match this code.");
    }
    const digest = createHash("sha256").update(form.code_verifier).digest("base64url");
    if (digest !== grant.codeChallenge) {
      throw new OAuthTokenError(400, "invalid_grant", "PKCE verification failed.");
    }
    // Tokens do not expire — they are the agent's long-lived apiKey.
    return { access_token: grant.apiKey, token_type: "bearer", scope: "agent" };
  }

  /** RFC 8414 authorization server metadata. */
  metadata(): Record<string, unknown> {
    const base = this.config.appBaseUrl;
    return {
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/oauth/token`,
      registration_endpoint: `${base}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["agent"],
      service_documentation: `${base}/skill.md`,
    };
  }

  private grant(request: AuthorizeRequest, agentId: string, apiKey: string): URL {
    const code = this.codes.issue({
      agentId,
      apiKey,
      clientId: request.clientId,
      redirectUri: request.redirectUri,
      codeChallenge: request.codeChallenge,
      resource: request.resource,
    });
    const url = new URL(request.redirectUri);
    url.searchParams.set("code", code);
    if (request.state) url.searchParams.set("state", request.state);
    return url;
  }
}
