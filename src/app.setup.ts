import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ValidationError } from 'class-validator';
import helmet from 'helmet';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

function validationMessages(errors: ValidationError[]): string[] {
  return errors.flatMap((error) => {
    const ownMessage = error.constraints ? [Object.values(error.constraints)[0]] : [];
    return [...ownMessage, ...validationMessages(error.children ?? [])].filter(
      (message): message is string => Boolean(message),
    );
  });
}

export function configureApplication(app: NestExpressApplication, shutdownHooks = true): void {
  const config = app.get(ConfigService);
  const corsOrigins = config.getOrThrow<string[] | true>('http.corsOrigins');
  const httpAdapter = app.getHttpAdapter().getInstance() as {
    set(setting: string, value: boolean): void;
  };

  httpAdapter.set('trust proxy', config.getOrThrow<boolean>('http.trustProxy'));
  app.useBodyParser('json', { limit: config.getOrThrow<string>('http.bodyLimit') });
  app.use(helmet());
  app.enableCors({
    origin: corsOrigins === true ? true : corsOrigins,
    credentials: corsOrigins !== true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: true,
      exceptionFactory: (errors) => new BadRequestException({ erros: validationMessages(errors) }),
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());

  if (shutdownHooks) {
    app.enableShutdownHooks();
  }
}
