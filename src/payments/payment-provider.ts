/**
 * Generic payment abstraction. The bid route only talks to this interface;
 * x402 is one implementation. A future provider (another chain, another
 * protocol) implements the same contract and is swapped in `src/payments/index.ts`.
 */

export interface ChargeRequest {
  /** Whole US dollars to charge for THIS transaction. */
  chargeUsd: number;
  /** Human/agent readable restatement of what is being bought. */
  description: string;
  /** Absolute URL of the resource being paid for. */
  resourceUrl: string;
}

export interface PaymentChallenge {
  /** HTTP status to return (402). */
  status: number;
  /** JSON body describing how to pay. */
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

export interface VerifiedPayment {
  /** Unique idempotency key of the signed authorization (EIP-3009 nonce). */
  nonce: string;
  /** Wallet address that signed the payment. */
  payerAddress: string;
  /** Network the payment settles on (human name, e.g. "base-sepolia"). */
  network: string;
  /** Opaque provider state needed to settle later. */
  raw: unknown;
}

export interface SettledPayment {
  txHash: string;
  /** Headers to attach to the success response (payment receipt). */
  receiptHeaders: Record<string, string>;
}

export class PaymentRequiredError extends Error {
  constructor(
    readonly challenge: PaymentChallenge,
    readonly code: string = "payment_required",
  ) {
    super(code);
  }
}

export interface PaymentProvider {
  /** Build the 402 challenge for a computed charge. */
  createChallenge(request: ChargeRequest, errorCode?: string, hint?: string): Promise<PaymentChallenge>;
  /** Read the payment header from an incoming request, if present. */
  extractPaymentHeader(headers: Headers): string | null;
  /**
   * Decode + verify a submitted payment against the charge this request
   * computed. Throws PaymentRequiredError (with a fresh challenge) when the
   * payment is missing pieces, mismatched, expired, or rejected upstream.
   */
  verify(paymentHeader: string, request: ChargeRequest): Promise<VerifiedPayment>;
  /** Execute the verified payment on-chain. Throws on failure. */
  settle(payment: VerifiedPayment): Promise<SettledPayment>;
}
