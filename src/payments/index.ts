import type { PaymentProvider } from "@/payments/payment-provider";
import { X402PaymentProvider } from "@/payments/x402/x402-payment-provider";

const registry = globalThis as unknown as { __paymentProvider?: PaymentProvider };

/** Single place where the concrete payment implementation is chosen. */
export function getPaymentProvider(): PaymentProvider {
  registry.__paymentProvider ??= new X402PaymentProvider();
  return registry.__paymentProvider;
}

export * from "@/payments/payment-provider";
