import type { EnvironmentVariables } from './environment';

export interface AppConfiguration {
  environment: EnvironmentVariables['NODE_ENV'];
  port: number;
  databaseUrl: string;
  http: {
    corsOrigins: string[] | true;
    trustProxy: boolean;
    bodyLimit: string;
    rateLimitTtlMs: number;
    rateLimitMax: number;
  };
}

export default (): AppConfiguration => {
  const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:3000';

  return {
    environment: (process.env.NODE_ENV ?? 'development') as AppConfiguration['environment'],
    port: Number(process.env.PORT ?? 3000),
    databaseUrl: process.env.DATABASE_URL ?? '',
    http: {
      corsOrigins:
        corsOrigin === '*'
          ? true
          : corsOrigin
              .split(',')
              .map((origin) => origin.trim())
              .filter(Boolean),
      trustProxy: process.env.TRUST_PROXY === 'true',
      bodyLimit: process.env.BODY_LIMIT ?? '100kb',
      rateLimitTtlMs: Number(process.env.RATE_LIMIT_TTL_MS ?? 60_000),
      rateLimitMax: Number(process.env.RATE_LIMIT_MAX ?? 100),
    },
  };
};
