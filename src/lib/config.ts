/**
 * Typed application configuration, read once from the environment.
 * Everything network/payment related is resolved here so the rest of the app
 * never touches process.env directly.
 */

export type NetworkName = "base" | "base-sepolia";

const CAIP2_BY_NETWORK: Record<NetworkName, `${string}:${string}`> = {
  base: "eip155:8453",
  "base-sepolia": "eip155:84532",
};

const EXPLORER_BY_NETWORK: Record<NetworkName, string> = {
  base: "https://basescan.org",
  "base-sepolia": "https://sepolia.basescan.org",
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export interface AppConfig {
  /** Public wallet address that receives all USDC. Never a private key. */
  payToAddress: string;
  /** Human network name used in DB rows and skill.md. */
  network: NetworkName;
  /** CAIP-2 network id used on the x402 wire. */
  caip2Network: `${string}:${string}`;
  facilitatorUrl: string;
  explorerBaseUrl: string;
  appBaseUrl: string;
}

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cached) return cached;
  const network = (process.env.X402_NETWORK ?? "base-sepolia") as NetworkName;
  if (!(network in CAIP2_BY_NETWORK)) {
    throw new Error(`Unsupported X402_NETWORK: ${network}`);
  }
  cached = {
    payToAddress: required("PAYTO_ADDRESS"),
    network,
    caip2Network: CAIP2_BY_NETWORK[network],
    facilitatorUrl: process.env.FACILITATOR_URL ?? "https://x402.org/facilitator",
    explorerBaseUrl: EXPLORER_BY_NETWORK[network],
    appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:3000",
  };
  return cached;
}
