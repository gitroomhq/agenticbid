import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const FAKE_PRODUCTS = [
  ["Postiz", "https://postiz.com"],
  ["Moltbook", "https://moltbook.com"],
  ["AgentKit", "https://agentkit.dev"],
  ["Shipfast", "https://shipfa.st"],
  ["Devtool X", "https://devtoolx.io"],
  ["Cursorly", "https://cursorly.app"],
  ["Buildspace", "https://buildspace.sh"],
  ["Launchpad", "https://launchpad.gg"],
  ["Indie Radar", "https://indieradar.co"],
  ["Promptbase", "https://promptbase.example.com"],
  ["Coldmail AI", "https://coldmail.ai"],
  ["Sitegen", "https://sitegen.dev"],
  ["Formless", "https://formless.so"],
  ["Notifly", "https://notifly.app"],
  ["Datapipe", "https://datapipe.run"],
  ["Screenshot One", "https://screenshotone.example.com"],
  ["Uptime Lemur", "https://uptimelemur.com"],
  ["Kanban Zen", "https://kanbanzen.io"],
  ["Vector Vault", "https://vectorvault.dev"],
  ["Inbox Hero", "https://inboxhero.app"],
] as const;

async function main() {
  const apiKey = `ab_seed_${randomBytes(16).toString("hex")}`;
  const agent = await db.agent.upsert({
    where: { apiKeyHash: createHash("sha256").update("seed-agent").digest("hex") },
    update: {},
    create: {
      name: "seed-agent",
      apiKeyHash: createHash("sha256").update("seed-agent").digest("hex"),
      claimToken: randomBytes(16).toString("hex"),
      claimedAt: new Date(),
    },
  });

  const now = Date.now();
  for (let i = 0; i < FAKE_PRODUCTS.length; i++) {
    const [title, targetUrl] = FAKE_PRODUCTS[i];
    const totalBid = Math.max(5, Math.round(500 / (i + 1)));
    const firstBidAt = new Date(now - (i + 1) * 3_600_000 * 6);
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const listing = await db.listing.upsert({
      where: { targetUrl },
      update: {},
      create: {
        slug,
        targetUrl,
        title,
        totalBid,
        firstBidAt,
        lastRaiseAt: firstBidAt,
        clicks: Math.floor(Math.random() * 400),
        ownerId: agent.id,
        bids: {
          create: {
            amount: totalBid,
            newTotal: totalBid,
            kind: "NEW",
            paymentNonce: `0xseed${randomBytes(28).toString("hex")}`,
            txHash: `0xseedtx${randomBytes(28).toString("hex")}`,
            network: "base-sepolia",
            payerAddress: "0x0000000000000000000000000000000000000001",
            agentId: agent.id,
            createdAt: firstBidAt,
          },
        },
      },
    });
    // a few click events in the last hours so "trending" has data
    const clickCount = Math.floor(Math.random() * 30);
    if (clickCount > 0) {
      await db.clickEvent.createMany({
        data: Array.from({ length: clickCount }, () => ({
          listingId: listing.id,
          createdAt: new Date(now - Math.floor(Math.random() * 3_600_000 * 24)),
        })),
      });
    }
  }
  console.log(`Seeded ${FAKE_PRODUCTS.length} listings (agent key: ${apiKey} — hash not stored, seed agent is claim-only)`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect();
    process.exit(1);
  });
