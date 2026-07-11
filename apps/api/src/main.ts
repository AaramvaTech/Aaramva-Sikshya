import './instrument'; // Sentry first — must precede all other imports (OPS-1 T2)
import { ConsoleLogger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './modules/common/filters/http-exception.filter';
import { ResponseInterceptor } from './modules/common/interceptors/response.interceptor';
import { LoggingInterceptor } from './modules/common/interceptors/logging.interceptor';

async function bootstrap() {
  // Disable default 100 kb body-parser so we can raise the limit for base64 photo uploads.
  // Replace with S3 presigned-URL uploads when file storage is configured.
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    // OPS-1 T3: pretty logs in dev, JSON lines in production.
    logger: new ConsoleLogger({ json: process.env.NODE_ENV === 'production' }),
  });

  // Security headers on every response. Default CSP is fine for a JSON/PDF API
  // (it only constrains browser HTML rendering); the report-card PDF and logo
  // endpoints were verified unaffected after enabling. The ONE HTML route —
  // the eSewa pay page — sets its own stricter per-response CSP with scoped
  // allowances (script nonce + form-action to eSewa); see EsewaService.buildPayPage.
  app.use(helmet());

  app.use(json({ limit: '5mb' }));
  app.use(urlencoded({ extended: true, limit: '5mb' }));

  // /health stays at the root path — monitors should not need the API prefix.
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalInterceptors(new LoggingInterceptor(), new ResponseInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  // Flush Prisma/Redis connections cleanly on SIGTERM/SIGINT (container stops).
  app.enableShutdownHooks();

  app.use(cookieParser());

  const devOrigins = [
    'http://localhost:3000',  // Next.js web portal
    'http://localhost:8081',  // Expo web (dev)
  ];
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? devOrigins,
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
