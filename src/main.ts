import 'reflect-metadata';
import { ConsoleLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApplication } from './app.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger: new ConsoleLogger({ json: true }),
  });
  configureApplication(app);

  const config = app.get(ConfigService);
  const port = config.getOrThrow<number>('port');
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
