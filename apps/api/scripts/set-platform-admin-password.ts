/**
 * Operator tool: set a platform admin's password interactively.
 *
 * Run it YOURSELF in a terminal (the password is typed with masked input and
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

function askVisible(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (a) => {
      rl.close();
      resolve(a.trim());
    }),
  );
}

const CTRL_C = String.fromCharCode(3);
const BACKSPACE = String.fromCharCode(8);
const DEL = String.fromCharCode(127);

/** Raw-mode masked input: echoes '*' per keystroke; robust on Windows terminals. */
function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    if (stdin.readableEnded) {
      // stdin already closed (piped input exhausted) — never look like success.
      console.error('Aborted: stdin closed before a password was entered.');
      process.exit(1);
    }
    process.stdout.write(question);
    const wasRaw = stdin.isRaw;
    stdin.resume();
    stdin.setRawMode?.(true);
    let buf = '';
    const onData = (chunk: Buffer) => {
      for (const c of chunk.toString('utf8')) {
        if (c === '\r' || c === '\n') {
          stdin.removeListener('data', onData);
          stdin.setRawMode?.(wasRaw ?? false);
          stdin.pause();
          process.stdout.write('\n');
          resolve(buf);
          return;
        }
        if (c === CTRL_C) {
          // Ctrl+C
          process.stdout.write('\n');
          process.exit(1);
        }
        if (c === BACKSPACE || c === DEL) {
          // Backspace
          if (buf.length > 0) {
            buf = buf.slice(0, -1);
            process.stdout.write('\b \b');
          }
          continue;
        }
        buf += c;
        process.stdout.write('*');
      }
    };
    stdin.on('data', onData);
    stdin.once('end', () => {
      // Piped/closed stdin must never look like success.
      process.stdout.write('\n');
      console.error('Aborted: stdin closed before a password was entered.');
      process.exit(1);
    });
  });
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const email =
      (await askVisible('Platform admin email [admin@aaramvashikshya.com]: ')) ||
      'admin@aaramvashikshya.com';

    // Validate the account BEFORE asking for a password — catches the
    // typed-password-into-email-prompt mistake early and loudly.
    const admins = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM platform_admins WHERE email = ${email} AND is_active = true`;
    if (admins.length !== 1) {
      console.error(
        `Refused: no active platform admin with email "${email}". ` +
          `(Did you type a password into the email prompt? Nothing was changed.)`,
      );
      process.exit(1);
    }

    const pw = await askHidden('New password (masked with *): ');
    if (pw.length < MIN_LENGTH) {
      console.error(`Refused: password must be at least ${MIN_LENGTH} characters.`);
      process.exit(1);
    }
    if (pw === 'Admin@12345' || pw === 'AaramvaTechSikshya@12345') {
      console.error('Refused: that password has been exposed — choose a fresh one.');
      process.exit(1);
    }
    const confirm = await askHidden('Repeat password (masked with *): ');
    if (pw !== confirm) {
      console.error('Refused: passwords do not match.');
      process.exit(1);
    }

    const hash = await bcrypt.hash(pw, BCRYPT_ROUNDS);
    const updated = await prisma.$executeRaw`
      UPDATE platform_admins SET password_hash = ${hash}, updated_at = NOW()
      WHERE email = ${email} AND is_active = true`;
    if (updated === 1) {
      console.log(`Password updated for ${email}.`);
    } else {
      console.error(`Unexpected: rows updated = ${updated}. Nothing may have changed.`);
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
