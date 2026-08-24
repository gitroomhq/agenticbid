import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { ApiError } from "@/lib/errors";
import { getServices } from "@/lib/services";
import { OAuthRequestError } from "@/domain/oauth/errors";
import { OAUTH_PARAM_KEYS, firstString } from "@/app/oauth/authorize/params";

export const runtime = "nodejs";

/**
 * Consent form submission: create (or connect) the agent and bounce back to
 * the MCP client's redirect_uri with an authorization code. Input problems
 * (bad name, unknown apiKey) send the human back to the screen with a
 * message; protocol problems follow RFC 6749 error rules.
 */
export const POST = async (request: Request): Promise<Response> => {
  const { oauth } = getServices();
  const form = await request.formData();
  const query = Object.fromEntries(
    [...form.entries()].map(([key, value]) => [key, firstString(value)]),
  );

  let authorizeRequest;
  try {
    authorizeRequest = oauth.parseAuthorizeRequest(query);
  } catch (err) {
    if (!OAuthRequestError.is(err)) throw err;
    const target = err.redirectUrl();
    if (target) return NextResponse.redirect(target, 303);
    return NextResponse.json(
      { error: err.error, error_description: err.description },
      { status: 400 },
    );
  }

  try {
    const apiKey = query.api_key?.trim();
    const target = apiKey
      ? await oauth.approveWithExistingKey(authorizeRequest, apiKey)
      : await oauth.approveWithNewAgent(authorizeRequest, query.agent_name ?? "");
    return NextResponse.redirect(target, 303);
  } catch (err) {
    if (!ApiError.is(err)) throw err;
    // Back to the screen with the message, OAuth params intact.
    const back = new URL("/oauth/authorize", getConfig().appBaseUrl);
    for (const key of OAUTH_PARAM_KEYS) {
      if (query[key]) back.searchParams.set(key, query[key]);
    }
    back.searchParams.set("form_error", err.hint);
    return NextResponse.redirect(back, 303);
  }
};
