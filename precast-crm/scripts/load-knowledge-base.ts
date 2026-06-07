// Load a markdown knowledge base into AppConfig so the AI agent uses it.
//
// The agent reads AppConfig key "agent.knowledge_base" → { content } on every
// turn (see loadKnowledgeBase in src/lib/agent/runtime-config.ts). This script
// upserts that row from a markdown file. Idempotent — re-running overwrites.
//
// Run with (default file = scripts/agent-knowledge-base.sample.md):
//   npx tsx scripts/load-knowledge-base.ts
//   npx tsx scripts/load-knowledge-base.ts path/to/your-kb.md

import { readFileSync } from "fs";
import { resolve } from "path";
import { prisma } from "../src/lib/prisma";

const KB_KEY = "agent.knowledge_base";
const DEFAULT_FILE = resolve(__dirname, "agent-knowledge-base.sample.md");

async function main() {
  const file = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_FILE;
  const content = readFileSync(file, "utf8");

  await prisma.appConfig.upsert({
    where: { key: KB_KEY },
    create: { key: KB_KEY, value: { content } },
    update: { value: { content } },
  });

  console.log(`Loaded knowledge base from ${file}`);
  console.log(`  ${content.length} chars → AppConfig["${KB_KEY}"].content`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
