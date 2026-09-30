import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const schemaPath = path.join(rootDir, 'server', 'prisma', 'schema.prisma');

const target = (process.argv[2] || '').toLowerCase();
if (!['postgres', 'postgresql', 'sqlite'].includes(target)) {
  console.error('Usage: node scripts/use-db.mjs <postgres|sqlite>');
  process.exit(1);
}

const provider = target.startsWith('postgres') ? 'postgresql' : 'sqlite';
const schemaContent = fs.readFileSync(schemaPath, 'utf8');
const updatedContent = schemaContent.replace(
  /provider\s*=\s*"(sqlite|postgresql)"/,
  `provider = "${provider}"`
);

fs.writeFileSync(schemaPath, updatedContent, 'utf8');
console.log(`✅ Updated Prisma datasource provider to "${provider}" in server/prisma/schema.prisma`);

execSync('npm --prefix server run prisma:generate', {
  cwd: rootDir,
  stdio: 'inherit',
});
