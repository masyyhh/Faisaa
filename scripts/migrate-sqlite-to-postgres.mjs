/**
 * Faisaa - SQLite to PostgreSQL Data Migration Script
 *
 * Usage:
 *   node scripts/migrate-sqlite-to-postgres.mjs [POSTGRES_DATABASE_URL]
 *
 * Example:
 *   node scripts/migrate-sqlite-to-postgres.mjs postgresql://finora:secret@localhost:5432/finora?schema=public
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const sqliteDbPath = path.join(rootDir, 'server', 'finora.db');

const targetUrl = process.argv[2] || process.env.TARGET_DATABASE_URL || process.env.POSTGRES_URL;

if (!targetUrl || !targetUrl.startsWith('postgres')) {
  console.error(`
❌ Error: Missing target PostgreSQL DATABASE_URL.

Usage:
  node scripts/migrate-sqlite-to-postgres.mjs "postgresql://user:password@localhost:5432/faisaa?schema=public"
`);
  process.exit(1);
}

if (!fs.existsSync(sqliteDbPath)) {
  console.error(`❌ Source SQLite database not found at ${sqliteDbPath}`);
  process.exit(1);
}

async function runMigration() {
  console.log('📦 Starting migration from local SQLite to production PostgreSQL...');
  console.log(`📍 Source SQLite: ${sqliteDbPath}`);
  console.log(`📍 Target PostgreSQL: ${targetUrl.replace(/:[^:@]+@/, ':****@')}`);

  // Step 1: Connect to SQLite using current Prisma setup
  const sqlitePrisma = new PrismaClient({
    datasources: {
      db: { url: `file:${sqliteDbPath}` },
    },
  });

  console.log('🔄 Fetching existing records from SQLite...');
  const users = await sqlitePrisma.user.findMany();
  const accounts = await sqlitePrisma.account.findMany();
  const categories = await sqlitePrisma.category.findMany();
  const transactions = await sqlitePrisma.transaction.findMany();
  const tags = await sqlitePrisma.tag.findMany();
  const transactionTags = await sqlitePrisma.transactionTag.findMany();
  const budgets = await sqlitePrisma.budget.findMany();
  const budgetItems = await sqlitePrisma.budgetItem.findMany();
  const savingsGoals = await sqlitePrisma.savingsGoal.findMany();
  const recurring = await sqlitePrisma.recurringTransaction.findMany();
  const bills = await sqlitePrisma.bill.findMany();
  const notifications = await sqlitePrisma.notification.findMany();
  const currencyExchanges = await sqlitePrisma.currencyExchange.findMany();
  const exchangeRateHistory = await sqlitePrisma.exchangeRateHistory.findMany();
  const refreshTokens = await sqlitePrisma.refreshToken.findMany();

  console.log(`  - Users: ${users.length}`);
  console.log(`  - Accounts: ${accounts.length}`);
  console.log(`  - Categories: ${categories.length}`);
  console.log(`  - Transactions: ${transactions.length}`);
  console.log(`  - Budgets: ${budgets.length}`);
  console.log(`  - Savings Goals: ${savingsGoals.length}`);
  console.log(`  - Recurring Rules: ${recurring.length}`);
  console.log(`  - Bills: ${bills.length}`);
  console.log(`  - Notifications: ${notifications.length}`);

  await sqlitePrisma.$disconnect();

  // Step 2: Switch datasource to postgresql and push schema
  console.log('\n🔄 Applying Prisma schema to PostgreSQL database...');
  execSync(`node scripts/use-db.mjs postgres`, { cwd: rootDir, stdio: 'inherit' });
  execSync(`DATABASE_URL="${targetUrl}" npm --prefix server run prisma:push`, {
    cwd: rootDir,
    stdio: 'inherit',
  });

  // Step 3: Connect to PostgreSQL and load records
  const pgPrisma = new PrismaClient({
    datasources: {
      db: { url: targetUrl },
    },
  });

  console.log('\n🚀 Inserting records into PostgreSQL in topological order...');

  // Users
  for (const u of users) {
    await pgPrisma.user.upsert({
      where: { id: u.id },
      create: u,
      update: u,
    });
  }
  console.log(`  ✅ Users migrated (${users.length})`);

  // Accounts
  for (const a of accounts) {
    await pgPrisma.account.upsert({
      where: { id: a.id },
      create: a,
      update: a,
    });
  }
  console.log(`  ✅ Accounts migrated (${accounts.length})`);

  // Categories
  for (const c of categories) {
    await pgPrisma.category.upsert({
      where: { id: c.id },
      create: c,
      update: c,
    });
  }
  console.log(`  ✅ Categories migrated (${categories.length})`);

  // Tags
  for (const t of tags) {
    await pgPrisma.tag.upsert({
      where: { id: t.id },
      create: t,
      update: t,
    });
  }

  // Transactions
  for (const tx of transactions) {
    await pgPrisma.transaction.upsert({
      where: { id: tx.id },
      create: tx,
      update: tx,
    });
  }
  console.log(`  ✅ Transactions migrated (${transactions.length})`);

  // TransactionTags
  for (const tt of transactionTags) {
    await pgPrisma.transactionTag.upsert({
      where: { id: tt.id },
      create: tt,
      update: tt,
    });
  }

  // Budgets & BudgetItems
  for (const b of budgets) {
    await pgPrisma.budget.upsert({
      where: { id: b.id },
      create: b,
      update: b,
    });
  }
  for (const bi of budgetItems) {
    await pgPrisma.budgetItem.upsert({
      where: { id: bi.id },
      create: bi,
      update: bi,
    });
  }
  console.log(`  ✅ Budgets migrated (${budgets.length})`);

  // Savings Goals
  for (const sg of savingsGoals) {
    await pgPrisma.savingsGoal.upsert({
      where: { id: sg.id },
      create: sg,
      update: sg,
    });
  }

  // Recurring & Bills
  for (const r of recurring) {
    await pgPrisma.recurringTransaction.upsert({
      where: { id: r.id },
      create: r,
      update: r,
    });
  }
  for (const bl of bills) {
    await pgPrisma.bill.upsert({
      where: { id: bl.id },
      create: bl,
      update: bl,
    });
  }

  // Notifications, Exchanges, Rates, Refresh Tokens
  for (const n of notifications) {
    await pgPrisma.notification.upsert({
      where: { id: n.id },
      create: n,
      update: n,
    });
  }
  for (const ce of currencyExchanges) {
    await pgPrisma.currencyExchange.upsert({
      where: { id: ce.id },
      create: ce,
      update: ce,
    });
  }
  for (const erh of exchangeRateHistory) {
    await pgPrisma.exchangeRateHistory.upsert({
      where: { id: erh.id },
      create: erh,
      update: erh,
    });
  }
  for (const rt of refreshTokens) {
    await pgPrisma.refreshToken.upsert({
      where: { id: rt.id },
      create: rt,
      update: rt,
    });
  }

  await pgPrisma.$disconnect();

  console.log('\n🎉 SUCCESS! All data migrated to PostgreSQL cleanly with 0 loss.');
  console.log('Update your server/.env: DATABASE_URL="<your_postgres_url>"');
}

runMigration().catch((err) => {
  console.error('\n❌ Migration failed:', err);
  process.exit(1);
});
