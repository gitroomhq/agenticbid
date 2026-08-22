import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { registerExactEvmScheme } from "@x402/evm/exact/server";
import {
  decodePaymentSignatureHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { getConfig } from "@/lib/config";
import { logger } from "@/lib/logger";
import {
  type ChargeRequest,
  type PaymentChallenge,
  type PaymentProvider,
  PaymentRequiredError,
  type SettledPayment,
  type VerifiedPayment,
} from "@/payments/payment-provider";

const X402_VERSION = 2;
const MAX_TIMEOUT_SECONDS = 300;

interface X402VerifiedState {
  payload: PaymentPayload;
  requirements: PaymentRequirements;
}

/**
 * x402 v2 implementation of the PaymentProvider contract.
 *
 * Dynamic pricing: requirements are rebuilt from the request body on every
 * call (the static route-map middleware cannot express per-request amounts),
 * then the submitted payment is checked against exactly those requirements
 * before the facilitator's verify/settle run.
 */
export class X402PaymentProvider implements PaymentProvider {
  private server: x402ResourceServer | null = null;
  private initializing: Promise<x402ResourceServer> | null = null;

  private async getServer(): Promise<x402ResourceServer> {
    if (this.server) return this.server;
    this.initializing ??= (async () => {
      const { facilitatorUrl, caip2Network } = getConfig();
      const server = new x402ResourceServer(
        new HTTPFacilitatorClient({ url: facilitatorUrl }),
      );
      registerExactEvmScheme(server, { networks: [caip2Network] });
      await server.initialize(); // fetches supported kinds from the facilitator
      this.server = server;
      return server;
    })();
    try {
      return await this.initializing;
    } catch (err) {
      this.initializing = null; // retry on the next request
      throw err;
    }
  }

  private async buildRequirements(request: ChargeRequest): Promise<PaymentRequirements[]> {
    const server = await this.getServer();
    const { payToAddress, caip2Network } = getConfig();
    return server.buildPaymentRequirements({
      scheme: "exact",
      payTo: payToAddress,
      price: `$${request.chargeUsd}`,
      network: caip2Network,
      maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
    });
  }

  async createChallenge(
    request: ChargeRequest,
    errorCode?: string,
    hint?: string,
  ): Promise<PaymentChallenge> {
    const server = await this.getServer();
    const requirements = await this.buildRequirements(request);
    const paymentRequired = await server.createPaymentRequiredResponse(
      requirements,
      { url: request.resourceUrl, description: request.description },
      errorCode,
    );
    logger.info("payment_402_issued", {
      chargeUsd: request.chargeUsd,
      resource: request.resourceUrl,
      error: errorCode ?? null,
    });
    return {
      status: 402,
      body: { ...paymentRequired, ...(hint ? { hint } : {}) } as Record<string, unknown>,
      headers: { "Cache-Control": "no-store" },
    };
  }

  extractPaymentHeader(headers: Headers): string | null {
    return headers.get("payment-signature") ?? headers.get("x-payment");
  }

  async verify(paymentHeader: string, request: ChargeRequest): Promise<VerifiedPayment> {
    const server = await this.getServer();
    const { network } = getConfig();

    let payload: PaymentPayload;
    try {
      payload = decodePaymentSignatureHeader(paymentHeader);
    } catch {
      throw new PaymentRequiredError(
        await this.createChallenge(
          request,
          "malformed_payment_header",
          "The payment header could not be decoded. Retry with the requirements in this response.",
        ),
        "malformed_payment_header",
      );
    }

    const requirements = await this.buildRequirements(request);
    const matched = requirements.find((candidate) =>
      this.matches(candidate, payload.accepted),
    );
    if (!matched) {
      throw new PaymentRequiredError(
        await this.createChallenge(
          request,
          "payment_requirements_mismatch",
          "The signed payment does not match this bid's price/recipient. Re-read the 402 requirements (the charge is computed from your request body) and sign again.",
        ),
        "payment_requirements_mismatch",
      );
    }

    const result = await server.verifyPayment(payload, matched);
    if (!result.isValid) {
      logger.warn("payment_verify_rejected", {
        reason: result.invalidReason,
        message: result.invalidMessage,
      });
      throw new PaymentRequiredError(
        await this.createChallenge(
          request,
          result.invalidReason ?? "payment_invalid",
          result.invalidMessage ??
            "The facilitator rejected this payment. Check your USDC balance and authorization validity window, then retry.",
        ),
        result.invalidReason ?? "payment_invalid",
      );
    }

    const nonce = this.extractNonce(payload);
    const payer = result.payer ?? this.extractPayer(payload);
    logger.info("payment_verified", { payer, nonce });
    return {
      nonce,
      payerAddress: payer,
      network,
      raw: { payload, requirements: matched } satisfies X402VerifiedState,
    };
  }

  async settle(payment: VerifiedPayment): Promise<SettledPayment> {
    const server = await this.getServer();
    const { payload, requirements } = payment.raw as X402VerifiedState;
    const result = await server.settlePayment(payload, requirements);
    if (!result.success) {
      logger.error("payment_settle_failed", {
        reason: result.errorReason,
        message: result.errorMessage,
        nonce: payment.nonce,
      });
      throw new Error(result.errorMessage ?? result.errorReason ?? "settlement failed");
    }
    logger.info("payment_settled", {
      tx: result.transaction,
      payer: result.payer,
      nonce: payment.nonce,
    });
    const receipt = encodePaymentResponseHeader(result);
    return {
      txHash: result.transaction,
      receiptHeaders: {
        "PAYMENT-RESPONSE": receipt,
        "X-PAYMENT-RESPONSE": receipt,
      },
    };
  }

  /** Field-level match: the payment must be for exactly this charge. */
  private matches(ours: PaymentRequirements, theirs: PaymentRequirements): boolean {
    return (
      ours.scheme === theirs.scheme &&
      ours.network === theirs.network &&
      ours.asset.toLowerCase() === theirs.asset.toLowerCase() &&
      ours.payTo.toLowerCase() === theirs.payTo.toLowerCase() &&
      ours.amount === theirs.amount
    );
  }

  private extractNonce(payload: PaymentPayload): string {
    const inner = payload.payload as {
      authorization?: { nonce?: string };
      permit2Authorization?: { nonce?: string };
    };
    const nonce = inner.authorization?.nonce ?? inner.permit2Authorization?.nonce;
    if (!nonce) throw new Error("payment payload carries no authorization nonce");
    return nonce;
  }

  private extractPayer(payload: PaymentPayload): string {
    const inner = payload.payload as {
      authorization?: { from?: string };
      permit2Authorization?: { from?: string };
    };
    return inner.authorization?.from ?? inner.permit2Authorization?.from ?? "unknown";
  }
}

export { X402_VERSION };
