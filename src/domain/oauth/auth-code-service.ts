import { randomBytes } from "node:crypto";
import type { SecretBox } from "@/domain/oauth/secret-box";
import { OAuthTokenError } from "@/domain/oauth/errors";

export interface AuthCodeGrant {
  agentId: string;
  /** The agent's raw apiKey — becomes the access token. Sealed, never legible in transit. */
  apiKey: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  resource?: string;
}

interface SealedCode extends AuthCodeGrant {
  exp: number;
  jti: string;
}

const CODE_PREFIX = "vda_";
const CODE_TTL_MS = 10 * 60 * 1000;

/**
 * Authorization codes as sealed stateless tokens: short-lived, bound to the
 * client, redirect URI, and PKCE challenge. A per-process used-set adds
 * best-effort single-use on top (replay within the TTL additionally requires
 * the PKCE verifier, which only the legitimate client holds).
 */
export class AuthCodeService {
  private readonly used = new Map<string, number>();

  constructor(private readonly box: SecretBox) {}

  issue(grant: AuthCodeGrant): string {
    const sealed: SealedCode = {
      ...grant,
      exp: Date.now() + CODE_TTL_MS,
      jti: randomBytes(8).toString("hex"),
    };
    return CODE_PREFIX + this.box.seal(sealed);
  }

  /** Validate and consume a code; throws OAuthTokenError on any failure. */
  redeem(code: string): AuthCodeGrant {
    const invalid = new OAuthTokenError(
      400,
      "invalid_grant",
      "Authorization code is invalid or expired. Restart the authorization flow.",
    );
    if (!code.startsWith(CODE_PREFIX)) throw invalid;
    const sealed = this.box.open<SealedCode>(code.slice(CODE_PREFIX.length));
    if (!sealed || typeof sealed.exp !== "number") throw invalid;
    if (Date.now() > sealed.exp) throw invalid;
    if (this.used.has(sealed.jti)) throw invalid;
    this.used.set(sealed.jti, sealed.exp);
    this.prune();
    return sealed;
  }

  private prune(): void {
    if (this.used.size < 1000) return;
    const now = Date.now();
    for (const [jti, exp] of this.used) {
      if (exp < now) this.used.delete(jti);
    }
  }
}
