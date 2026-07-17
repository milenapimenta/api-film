import Joi from 'joi';

export type NodeEnvironment = 'development' | 'test' | 'production';

export interface EnvironmentVariables {
  NODE_ENV: NodeEnvironment;
  PORT: number;
  DATABASE_URL: string;
  CORS_ORIGIN: string;
  TRUST_PROXY: boolean;
  BODY_LIMIT: string;
  RATE_LIMIT_TTL_MS: number;
  RATE_LIMIT_MAX: number;
}

const schema = Joi.object<EnvironmentVariables>({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().integer().min(1).max(65535).default(3000),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),
  CORS_ORIGIN: Joi.string().min(1).default('http://localhost:3000'),
  TRUST_PROXY: Joi.boolean().truthy('true').falsy('false').default(false),
  BODY_LIMIT: Joi.string()
    .pattern(/^\d+(b|kb|mb)$/i)
    .default('100kb'),
  RATE_LIMIT_TTL_MS: Joi.number().integer().min(1000).default(60_000),
  RATE_LIMIT_MAX: Joi.number().integer().min(1).default(100),
}).unknown(true);

export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  const result = schema.validate(config, {
    abortEarly: false,
    convert: true,
  });
  const value: unknown = result.value;

  if (result.error) {
    throw new Error(`Configuração de ambiente inválida: ${result.error.message}`);
  }

  return value as EnvironmentVariables;
}
