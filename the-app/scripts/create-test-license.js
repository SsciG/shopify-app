// Run with: node scripts/create-test-license.js
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createTestLicense() {
  // Generate a simple test key
  const key = "TEST-" + Math.random().toString(36).substring(2, 6).toUpperCase() + "-" +
              Math.random().toString(36).substring(2, 6).toUpperCase();

  const license = await prisma.license.create({
    data: {
      key,
      email: "test@example.com",
      plan: "starter",
      maxStores: 1,
      status: "active",
      jewdaOrderId: "test-" + Date.now(),
    },
  });

  console.log("\n✅ Test license created:\n");
  console.log("  Key:", license.key);
  console.log("  Email:", license.email);
  console.log("  Plan:", license.plan);
  console.log("  Max Stores:", license.maxStores);
  console.log("\n  Install URL: http://localhost:49588/install?license=" + license.key);
  console.log("\n");

  await prisma.$disconnect();
}

createTestLicense().catch(console.error);
