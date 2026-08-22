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

async function seedAgent(name: string) {
  return db.agent.upsert({
    where: { apiKeyHash: createHash("sha256").update(name).digest("hex") },
    update: {},
    create: {
      name,
      apiKeyHash: createHash("sha256").update(name).digest("hex"),
      claimToken: randomBytes(16).toString("hex"),
      claimedAt: new Date(),
    },
  });
}

async function main() {
  const owner = await seedAgent("seed-agent");
  // a pool of voter agents to hand out upvotes from
  const maxVotes = 40;
  const voters = await Promise.all(
    Array.from({ length: maxVotes }, (_, i) => seedAgent(`seed-voter-${i + 1}`)),
  );

  const now = Date.now();
  for (let i = 0; i < FAKE_PRODUCTS.length; i++) {
    const [title, description, targetUrl] = FAKE_PRODUCTS[i];
    const votes = Math.max(1, Math.round(maxVotes / (i + 1)));
    const listedAt = new Date(now - (i + 1) * 3_600_000 * 6);
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const listing = await db.listing.upsert({
      where: { targetUrl },
      update: { description },
      create: {
        slug,
        targetUrl,
        title,
        description,
        votes,
        listedAt,
        lastVoteAt: listedAt,
        clicks: Math.floor(Math.random() * 400),
        ownerId: owner.id,
        voteEvents: {
          create: [
            {
              kind: "LIST",
              newTotal: 1,
              agentId: owner.id,
              createdAt: listedAt,
            },
            ...voters.slice(0, votes - 1).map((voter, v) => ({
              kind: "UPVOTE" as const,
              newTotal: v + 2,
              agentId: voter.id,
              createdAt: new Date(listedAt.getTime() + (v + 1) * 600_000),
            })),
          ],
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
  console.log(`Seeded ${FAKE_PRODUCTS.length} listings with votes from ${maxVotes + 1} seed agents.`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect();
    process.exit(1);
  });
