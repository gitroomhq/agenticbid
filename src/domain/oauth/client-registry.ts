import type { SecretBox } from "@/domain/oauth/secret-box";

export interface RegisteredClient {
  clientId: string;
  redirectUris: string[];
  name?: string;
}

/**
 * OAuth client registry contract (RFC 7591 dynamic client registration).
 * Swap the stateless implementation for a DB-backed one behind this
 * interface if client records ever need listing or revocation.
 */
export interface OAuthClientRegistry {
  register(input: { redirectUris: string[]; name?: string }): RegisteredClient;
  resolve(clientId: string): RegisteredClient | null;
}

interface SealedClientRecord {
  v: 1;
  r: string[];
  n?: string;
}

const CLIENT_ID_PREFIX = "vdc_";

/** True for redirect URIs we accept: https, or http on a loopback host. */
export function isAcceptableRedirectUri(uri: string): boolean {
  try {
    const url = new URL(uri);
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && isLoopbackHost(url.hostname);
  } catch {
    return false;
  }
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

/**
 * Exact match, except loopback redirects may vary their port (RFC 8252 §7.3 —
 * native clients bind an ephemeral localhost port per run).
 */
export function redirectUriMatches(registered: string, presented: string): boolean {
  if (registered === presented) return true;
  try {
    const a = new URL(registered);
    const b = new URL(presented);
    return (
      a.protocol === "http:" &&
      b.protocol === "http:" &&
      isLoopbackHost(a.hostname) &&
      a.hostname === b.hostname &&
      a.pathname === b.pathname
    );
  } catch {
    return false;
  }
}

/**
 * Stateless registry: the client_id itself is the sealed client record, so
 * registration needs no storage, survives restarts, and scales horizontally.
 */
export class StatelessClientRegistry implements OAuthClientRegistry {
  constructor(private readonly box: SecretBox) {}

  register(input: { redirectUris: string[]; name?: string }): RegisteredClient {
    const record: SealedClientRecord = { v: 1, r: input.redirectUris, n: input.name };
    return {
      clientId: CLIENT_ID_PREFIX + this.box.seal(record),
      redirectUris: input.redirectUris,
      name: input.name,
    };
  }

  resolve(clientId: string): RegisteredClient | null {
    if (!clientId.startsWith(CLIENT_ID_PREFIX)) return null;
    const record = this.box.open<SealedClientRecord>(clientId.slice(CLIENT_ID_PREFIX.length));
    if (!record || record.v !== 1 || !Array.isArray(record.r)) return null;
    return { clientId, redirectUris: record.r, name: record.n };
  }
}
