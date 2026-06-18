import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './modules/common/filters/http-exception.filter';
import { ResponseInterceptor } from './modules/common/interceptors/response.interceptor';

async function bootstrap() {
  // Disable default 100 kb body-parser so we can raise the limit for base64 photo uploads.
  // Replace with S3 presigned-URL uploads when file storage is configured.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: '5mb' }));
  app.use(urlencoded({ extended: true, limit: '5mb' }));

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

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
