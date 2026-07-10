import * as Joi from 'joi';

/**
 * Boot-time environment validation.
 *
 * Wired into ConfigModule.forRoot({ validationSchema }) so the app REFUSES to
 * start if a required secret is missing or too weak. This is the fail-fast that
 * replaces the old `?? 'change-me-access'` fallback in jwt.strategy.ts.
 *
 * Redis and SMS are legitimately optional (Redis is off in dev; SMS mocks).
 */
export const envValidationSchema = Joi.object({
  // ─── Required ──────────────────────────────────────────────────────────────
  DATABASE_URL: Joi.string().required(),

  // Signing secret for access tokens. Must be strong.
  JWT_ACCESS_SECRET: Joi.string().min(32).required().messages({
    'string.min': 'JWT_ACCESS_SECRET must be at least 32 characters.',
    'any.required': 'JWT_ACCESS_SECRET is required — the app will not start without it.',
  }),

  // NOTE: refresh tokens are currently opaque UUIDs (SHA-256 hashed in the
  // refresh_tokens table), NOT JWTs — so JWT_REFRESH_SECRET is not read anywhere
  // in code today. It is still required + min-32 here so the deployment invariant
  // holds and a future switch to signed refresh tokens is already guarded.
  JWT_REFRESH_SECRET: Joi.string().min(32).required().messages({
    'string.min': 'JWT_REFRESH_SECRET must be at least 32 characters.',
    'any.required': 'JWT_REFRESH_SECRET is required — the app will not start without it.',
  }),

  // ─── Optional (have safe runtime defaults) ─────────────────────────────────
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  JWT_ACCESS_EXPIRY: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRY: Joi.string().default('7d'),
  APP_DOMAIN: Joi.string().optional(),
  ALLOWED_ORIGINS: Joi.string().optional(),

  // Redis is legitimately off in dev — optional.
  REDIS_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  REDIS_URL: Joi.string().optional(),
  REDIS_HOST: Joi.string().optional(),

  // SMS / integrations — optional (mock path when disabled).
  SPARROW_SMS_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  SPARROW_SMS_TOKEN: Joi.string().optional().allow(''),
  SPARROW_SMS_SENDER: Joi.string().optional().allow(''),

  // Cloud / payment placeholders — optional until configured.
  AWS_BUCKET_NAME: Joi.string().optional().allow(''),
  AWS_REGION: Joi.string().optional().allow(''),
  ESEWA_SECRET_KEY: Joi.string().optional().allow(''),
  KHALTI_SECRET_KEY: Joi.string().optional().allow(''),
});
