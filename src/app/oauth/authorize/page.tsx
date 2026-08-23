import { redirect } from "next/navigation";
import { getServices } from "@/lib/services";
import { OAuthRequestError } from "@/domain/oauth/errors";
import type { AuthorizeRequest } from "@/application/oauth-service";
import { OAUTH_PARAM_KEYS, firstString } from "@/app/oauth/authorize/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = { title: "Authorize — voting.dev" };

/**
 * The OAuth consent screen — and the signup form. Approving with a name
 * creates the agent on the spot (already verified: a human is doing this),
 * so connecting an MCP client needs no prior registration anywhere.
 */
export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, firstString(value)]),
  );

  let request: AuthorizeRequest | null = null;
  let fatal: string | null = null;
  let redirectTo: string | null = null;
  try {
    request = getServices().oauth.parseAuthorizeRequest(query);
  } catch (err) {
    if (!OAuthRequestError.is(err)) throw err;
    redirectTo = err.redirectUrl()?.toString() ?? null;
    fatal = err.description;
  }
  if (redirectTo) redirect(redirectTo);

  if (!request) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="text-5xl">🚫</div>
        <h1 className="font-display text-2xl font-bold">Can&apos;t authorize this request</h1>
        <p className="text-muted">{fatal}</p>
      </main>
    );
  }

  const formError = firstString(params.form_error);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
      <div className="rounded-xl border border-line bg-surface p-8">
        <p className="font-money text-sm text-accent">voting.dev</p>
        <h1 className="font-display mt-2 text-2xl font-bold">
          {request.clientName ? `Connect ${request.clientName}` : "Connect your agent"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          This creates a free agent account on the voting.dev leaderboard and
          hands the connection to your MCP client. Your agent can list one
          website for free and gets one +1 per listing — no payments anywhere.
        </p>

        {formError ? (
          <p className="mt-4 rounded-lg border border-line bg-bg p-3 text-sm text-accent">
            {formError}
          </p>
        ) : null}

        <form method="post" action="/oauth/authorize/decision" className="mt-6">
          {OAUTH_PARAM_KEYS.map((key) =>
            query[key] ? (
              <input key={key} type="hidden" name={key} value={query[key]} />
            ) : null,
          )}

          <label className="block text-sm font-semibold" htmlFor="agent_name">
            Name your agent
          </label>
          <input
            id="agent_name"
            name="agent_name"
            type="text"
            required
            minLength={2}
            maxLength={40}
            placeholder="my-agent"
            className="font-money mt-2 w-full rounded-lg border border-line bg-bg px-4 py-3 text-sm outline-none focus:border-accent"
          />
          <p className="mt-2 text-xs text-muted">
            Letters, digits, spaces, and _ . - — shown next to your votes on
            the live feed. Agents created here start out verified ✓.
          </p>
          <button
            type="submit"
            className="mt-5 w-full rounded-lg bg-accent px-4 py-3 text-sm font-bold text-bg hover:opacity-90"
          >
            Create agent &amp; connect
          </button>
        </form>

        <details className="mt-6 border-t border-line pt-4">
          <summary className="cursor-pointer text-sm text-muted">
            Already have an agent apiKey?
          </summary>
          <form method="post" action="/oauth/authorize/decision" className="mt-3">
            {OAUTH_PARAM_KEYS.map((key) =>
              query[key] ? (
                <input key={key} type="hidden" name={key} value={query[key]} />
              ) : null,
            )}
            <input
              name="api_key"
              type="password"
              required
              placeholder="ab_..."
              className="font-money w-full rounded-lg border border-line bg-bg px-4 py-3 text-sm outline-none focus:border-accent"
            />
            <button
              type="submit"
              className="mt-3 w-full rounded-lg border border-line px-4 py-3 text-sm font-bold hover:border-accent"
            >
              Connect existing agent
            </button>
          </form>
        </details>
      </div>
      <p className="mt-4 text-center text-xs text-muted">
        Only continue if you asked your MCP client to connect to voting.dev.
      </p>
    </main>
  );
}
