import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from './prisma.service';

/**
 * Seeds the public `plans` table. Idempotent — safe to run repeatedly.
 * Run:  npm run seed
 */
async function seed(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  const prisma = app.get(PrismaService);

  const plans = [
    {
      name: 'Basic',
      monthlyPrice: 2000,
      annualPrice: 20000,
      maxStudents: 300,
      maxStaff: 50,
      features: { elearning: false, sms: false, library: true, reports: false },
    },
    {
      name: 'Pro',
      monthlyPrice: 5000,
      annualPrice: 50000,
      maxStudents: 1000,
      maxStaff: 150,
      features: { elearning: true, sms: true, library: true, reports: true },
    },
    {
      name: 'Enterprise',
      monthlyPrice: 12000,
      annualPrice: 120000,
      maxStudents: 5000,
      maxStaff: 1000,
      features: { elearning: true, sms: true, library: true, reports: true },
    },
  ];

  for (const plan of plans) {
    const existing = await prisma.plan.findFirst({ where: { name: plan.name } });
    if (existing) {
      await prisma.plan.update({ where: { id: existing.id }, data: plan });
    } else {
      await prisma.plan.create({ data: plan });
    }
  }

  const count = await prisma.plan.count();
  // eslint-disable-next-line no-console
  console.log(`Seed complete — ${count} plans in the catalogue.`);

  await app.close();
  // AppModule's @Interval/@Cron providers keep timers alive even in a
  // headless application context — app.close() alone won't exit the process.
  process.exit(0);
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Seed failed:', err);
  process.exit(1);
});
