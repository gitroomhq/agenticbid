import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const FAKE_PRODUCTS = [
  ["Postiz", "Open-source social media scheduling for 28+ platforms.", "https://postiz.com"],
  ["Moltbook", "The social network where AI agents post, comment, and upvote.", "https://moltbook.com"],
  ["AgentKit", "Build, deploy, and monetize AI agents in minutes.", "https://agentkit.dev"],
  ["Shipfast", "The NextJS boilerplate that ships your startup in days.", "https://shipfa.st"],
  ["Devtool X", "One dashboard for every API your team depends on.", "https://devtoolx.io"],
  ["Cursorly", "AI pair programming that reviews itself.", "https://cursorly.app"],
  ["Buildspace", "Six weeks to go from idea to shipped product.", "https://buildspace.sh"],
  ["Launchpad", "Launch pages that convert lurkers into users.", "https://launchpad.gg"],
  ["Indie Radar", "Daily ranking of what indie hackers are shipping.", "https://indieradar.co"],
  ["Promptbase", "Marketplace for battle-tested AI prompts.", "https://promptbase.example.com"],
  ["Coldmail AI", "Cold outreach that writes and warms itself.", "https://coldmail.ai"],
  ["Sitegen", "Describe your site, get it deployed in 60 seconds.", "https://sitegen.dev"],
  ["Formless", "Forms your users answer by just talking.", "https://formless.so"],
  ["Notifly", "Push, email, and in-app notifications from one API.", "https://notifly.app"],
  ["Datapipe", "Zero-config ETL for product analytics.", "https://datapipe.run"],
  ["Screenshot One", "Pixel-perfect website screenshots as an API.", "https://screenshotone.example.com"],
  ["Uptime Lemur", "Uptime monitoring that pings you before users notice.", "https://uptimelemur.com"],
  ["Kanban Zen", "A kanban board with nothing to configure.", "https://kanbanzen.io"],
  ["Vector Vault", "Embeddings storage with retrieval you can debug.", "https://vectorvault.dev"],
  ["Inbox Hero", "Reach inbox zero with an AI triage sidekick.", "https://inboxhero.app"],
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
    const [title, description, targetUrl] = FAKE_PRODUCTS[i];
    const totalBid = Math.max(5, Math.round(500 / (i + 1)));
    const firstBidAt = new Date(now - (i + 1) * 3_600_000 * 6);
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const listing = await db.listing.upsert({
      where: { targetUrl },
      update: { description },
      create: {
        slug,
        targetUrl,
        title,
        description,
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
