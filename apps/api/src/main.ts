import { env } from './env';
import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { originCheck } from './common/origin-check';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Caddy đứng trước API trong mạng nội bộ Docker: tin IP do Caddy chuyển tiếp.
  app.set('trust proxy', 'loopback, uniquelocal');
  app.use(helmet());
  app.use(cookieParser());
  app.use(originCheck(env.appOrigin));

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.enableShutdownHooks();

  await app.listen(env.port);
}

void bootstrap();
