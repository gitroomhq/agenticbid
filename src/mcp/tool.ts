import type { CallToolResult, McpServer, ServerContext } from "@modelcontextprotocol/server";
import type { z } from "zod";
import type { Agent } from "@/generated/prisma/client";
import type { AppConfig } from "@/lib/config";
import type { Services } from "@/lib/services";
import { ApiError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/** Dependencies injected into every MCP tool at construction. */
export interface McpToolDeps {
  services: Services;
  config: AppConfig;
}

/** Per-call context derived from the HTTP/auth layer. */
export interface McpCallContext {
  /** Authenticated agent when the client sent a valid bearer apiKey. */
  agent: Agent | null;
  /** Originating HTTP request when available (used for per-IP rate limits). */
  request: Request | null;
}

/**
 * Generic contract for one MCP tool. Subclasses declare their name, schema,
 * and whether they need an authenticated agent; the base class owns the
 * cross-cutting concerns — auth enforcement and mapping ApiError to the
 * `{error, hint}` payloads agents already know from the REST API.
 */
export abstract class McpTool<TArgs> {
  abstract readonly name: string;
  abstract readonly title: string;
  abstract readonly description: string;
  abstract readonly inputSchema: z.ZodType<TArgs>;
  /** When true, calls without a valid bearer apiKey are rejected with guidance. */
  protected readonly requiresAuth: boolean = false;

  constructor(protected readonly deps: McpToolDeps) {}

  /** Produce the JSON payload for a call. Throw ApiError for expected failures. */
  protected abstract run(args: TArgs, context: McpCallContext): Promise<unknown>;

  register(server: McpServer): void {
    server.registerTool(
      this.name,
      {
        title: this.title,
        description: this.description,
        inputSchema: this.inputSchema,
      },
      async (args: TArgs, ctx: ServerContext): Promise<CallToolResult> => {
        const context: McpCallContext = {
          agent: (ctx.http?.authInfo?.extra?.agent as Agent | undefined) ?? null,
          request: ctx.http?.req ?? null,
        };
        try {
          if (this.requiresAuth && !context.agent) {
            throw new ApiError(
              401,
              "missing_api_key",
              "Connect this MCP server with your agent apiKey as a bearer token (Authorization: Bearer <apiKey>). No key yet? Call the register_agent tool and save the apiKey it returns.",
            );
          }
          const payload = await this.run(args, context);
          return this.json(payload);
        } catch (err) {
          if (ApiError.is(err)) return this.json(err.toBody(), true);
          logger.error("mcp_tool_error", {
            tool: this.name,
            message: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
          });
          return this.json(
            { error: "internal_error", hint: "Something went wrong on our side. Try again." },
            true,
          );
        }
      },
    );
  }

  private json(payload: unknown, isError = false): CallToolResult {
    return {
      ...(isError ? { isError: true } : {}),
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    };
  }
}
