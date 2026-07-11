/**
 * Operator tool: set a platform admin's password interactively.
 *
 * Run it YOURSELF in a terminal (the password is typed with hidden input and
 * never appears in argv, shell history, or logs):
 *
 *   cd apps/api && npx ts-node scripts/set-platform-admin-password.ts
 *
 * Exists because the super-admin portal has no change-password feature yet
 * (OPS-1 G1 finding). Remove once a proper authenticated endpoint + UI ship.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as readline from 'node:readline';

const BCRYPT_ROUNDS = 12; // matches TenantProvisioningService
const MIN_LENGTH = 12;

function ask(question: string, hidden: boolean): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  if (!hidden) {
    return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
  }
  // Muted echo: print the prompt once, swallow the typed characters.
  const stdout = process.stdout;
  return new Promise((resolve) => {
    stdout.write(question);
    const onData = () => {}; // keep reference shape simple; readline handles input
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = () => {};
    rl.question('', (a) => {
      rl.close();
      stdout.write('\n');
      resolve(a.trim());
    });
    void onData;
  });
}

async function main(): Promise<void> {
  const email = (await ask('Platform admin email [admin@aaramvashikshya.com]: ', false)) || 'admin@aaramvashikshya.com';
  const pw = await ask('New password (hidden): ', true);
  if (pw.length < MIN_LENGTH) {
    console.error(`Refused: password must be at least ${MIN_LENGTH} characters.`);
    process.exit(1);
  }
  if (pw === 'Admin@12345') {
    console.error('Refused: that is the leaked default password.');
    process.exit(1);
  }
  const confirm = await ask('Repeat password (hidden): ', true);
  if (pw !== confirm) {
    console.error('Refused: passwords do not match.');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const hash = await bcrypt.hash(pw, BCRYPT_ROUNDS);
    const updated = await prisma.$executeRaw`
      UPDATE platform_admins SET password_hash = ${hash}, updated_at = NOW()
      WHERE email = ${email} AND is_active = true`;
    if (updated === 1) {
      console.log(`Password updated for ${email}.`);
    } else {
      console.error(`No active platform admin found for ${email} (rows updated: ${updated}).`);
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
