import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Authenticated encryption for small JSON payloads (AES-256-GCM). Used to
 * mint opaque, tamper-proof, stateless tokens — OAuth client ids and
 * authorization codes — so nothing needs a server-side store and tokens
 * survive restarts and horizontal scaling.
 */
export class SecretBox {
  private readonly key: Buffer;

  constructor(secret: string) {
    this.key = createHash("sha256").update(secret).digest();
  }

  seal(payload: unknown): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
  }

  /** Returns null for anything that was not sealed by this box (or tampered). */
  open<T>(token: string): T | null {
    try {
      const raw = Buffer.from(token, "base64url");
      const decipher = createDecipheriv("aes-256-gcm", this.key, raw.subarray(0, 12));
      decipher.setAuthTag(raw.subarray(12, 28));
      const plaintext = Buffer.concat([
        decipher.update(raw.subarray(28)),
        decipher.final(),
      ]);
      return JSON.parse(plaintext.toString("utf8")) as T;
    } catch {
      return null;
    }
  }
}
