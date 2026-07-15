/* eslint-disable no-console */
/**
 * Platform super-admin bootstrap — creates (or resets) a PLATFORM_ADMIN,
 * the account that signs in at `{WEB_BASE_URL}/super-admin/login`.
 *
 * Platform admins live in the PUBLIC `platform_admins` table and are NOT
 * created by `npm run seed` (plans) or `npm run seed:demo` (a school), so a
 * fresh database has no super-admin. This is the supported way to make the
 * first one — and to reset a forgotten password later.
 *
 * Idempotent: if the email already exists, only the password is reset and the
 * account is re-activated (the existing name is left unchanged).
 *
 * Run (from apps/api):
 *   npm run seed:admin -- <email> <password> [firstName] [lastName]
 * Example (quote the password in PowerShell so special chars are safe):
 *   npm run seed:admin -- superadmin@aaramva.com 'SuperAdmin@123'
 */

import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../app.module';
import { PublicPrismaService } from '../modules/super-admin/public-prisma.service';

const USAGE =
  'Usage: npm run seed:admin -- <email> <password> [firstName] [lastName]';

async function seedAdmin(): Promise<void> {
  const [email, password, firstName = 'Super', lastName = 'Admin'] =
    process.argv.slice(2);

  if (!email || !password) {
    console.error(USAGE);
    process.exit(1);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error(`Invalid email address: "${email}"\n${USAGE}`);
    process.exit(1);
  }
  if (password.length < 8) {
    console.error(`Password must be at least 8 characters.\n${USAGE}`);
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  try {
    const publicPrisma = app.get(PublicPrismaService, { strict: false });
    const passwordHash = await bcrypt.hash(password, 12);

    await publicPrisma.execute(
      `INSERT INTO platform_admins (email, first_name, last_name, password_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email)
       DO UPDATE SET password_hash = EXCLUDED.password_hash,
                     is_active     = true,
                     updated_at    = NOW()`,
      email,
      firstName,
      lastName,
      passwordHash,
    );

    const loginUrl = `${process.env.WEB_BASE_URL ?? 'http://localhost:3000'}/super-admin/login`;
    console.log('');
    console.log('✔ Super admin ready');
    console.log(`  Login:    ${loginUrl}`);
    console.log(`  Email:    ${email}`);
    console.log('  Password: (the one you passed on the command line)');
    console.log('');
  } finally {
    await app.close();
  }
}

seedAdmin().catch((err) => {
  console.error('seed:admin failed:', err);
  process.exit(1);
});
