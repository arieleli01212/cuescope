import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// group מאגד כמה קטגוריות תחת נושא רחב אחד לצורך דוחות (ר' Category.group
// ב-schema.prisma). קטגוריה בלי group (למשל "אחר") מוצגת בדוח לפי שמה שלה.
const DEFAULT_CATEGORIES: { name: string; group?: string }[] = [
  { name: "מכולת", group: "אוכל" },
  { name: "מסעדות", group: "אוכל" },
  { name: "קפה", group: "אוכל" },
  { name: "תחבורה", group: "תחבורה" },
  { name: "דלק", group: "תחבורה" },
  { name: "בילויים" },
  { name: "קניות" },
  { name: "בריאות" },
  { name: "דיור" },
  { name: "חשבונות", group: "דיור" },
  { name: "לימודים" },
  { name: "אחר" },
];

async function main() {
  const userNames = (process.env.SEED_USER_NAMES ?? "Demo User")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const userApiKeys = (process.env.SEED_USER_API_KEYS ?? "local-development-key-change-me")
    .split(",")
    .map((apiKey) => apiKey.trim());

  if (userNames.length !== userApiKeys.length || userApiKeys.some((apiKey) => apiKey.length < 16)) {
    throw new Error("SEED_USER_NAMES and SEED_USER_API_KEYS must contain matching comma-separated values; keys need 16+ characters");
  }

  const users = userNames.map((name, index) => ({ name, apiKey: userApiKeys[index] }));

  console.log("Seeding users...");
  for (const u of users) {
    const existing = await prisma.user.findFirst({ where: { name: u.name } });
    if (existing) {
      console.log(`- ${u.name}: already exists (API key unchanged)`);
      continue;
    }
    await prisma.user.create({ data: u });
    console.log(`- ${u.name}: created`);
  }

  console.log("Seeding default categories...");
  for (const { name, group } of DEFAULT_CATEGORIES) {
    await prisma.category.upsert({ where: { name }, update: { group }, create: { name, group } });
  }
  console.log(`- ${DEFAULT_CATEGORIES.length} categories ready`);

  await prisma.settings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton", baseCurrency: "ILS" },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
