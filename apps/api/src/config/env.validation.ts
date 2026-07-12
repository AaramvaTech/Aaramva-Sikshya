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

  // Error tracking — optional (absent = Sentry disabled, boot notice logged).
  SENTRY_DSN: Joi.string().uri().optional().allow(''),

  // Mail (MAIL-1) — all optional: no SMTP_HOST and no MAIL_ETHEREAL means mail
  // is disabled (MOCK status, boot notice, sends logged and skipped).
  SMTP_HOST: Joi.string().optional().allow(''),
  SMTP_PORT: Joi.number().default(587),
  SMTP_SECURE: Joi.boolean().truthy('true').falsy('false').default(false),
  SMTP_USER: Joi.string().optional().allow(''),
  SMTP_PASS: Joi.string().optional().allow(''),
  MAIL_FROM: Joi.string().optional().allow(''),
  MAIL_FROM_NAME: Joi.string().optional().allow(''),
  // Dev-proof mode: auto-provisions a nodemailer Ethereal test inbox; every
  // send logs a preview URL. Ignored when SMTP_HOST is set.
  MAIL_ETHEREAL: Joi.boolean().truthy('true').falsy('false').default(false),

  // SMS / integrations — optional (mock path when disabled).
  SPARROW_SMS_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  SPARROW_SMS_TOKEN: Joi.string().optional().allow(''),
  SPARROW_SMS_SENDER: Joi.string().optional().allow(''),

  // Expo push (PUSH-1) — Expo's push API needs no secret; the access token is
  // only for EAS projects with enhanced push security enabled.
  EXPO_ACCESS_TOKEN: Joi.string().optional().allow(''),

  // Cloud placeholders — optional until configured.
  AWS_BUCKET_NAME: Joi.string().optional().allow(''),
  AWS_REGION: Joi.string().optional().allow(''),

  // File storage (FILE-1) — S3-compatible presigned uploads (MinIO dev,
  // R2/B2/AWS prod). ALL optional: any of the four core vars missing =
  // storage disabled with a boot notice (presign endpoints 503; the legacy
  // base64 path keeps working until cutover completes).
  S3_ENDPOINT: Joi.string().uri().optional().allow(''),
  S3_REGION: Joi.string().default('us-east-1'),
  S3_ACCESS_KEY: Joi.string().optional().allow(''),
  S3_SECRET_KEY: Joi.string().optional().allow(''),
  S3_BUCKET: Joi.string().optional().allow(''),
  // Path-style (bucket in the path) — required by MinIO and R2.
  S3_FORCE_PATH_STYLE: Joi.boolean().truthy('true').falsy('false').default(true),
  // Public base for public-read kinds (school-logo). Defaults to
  // {S3_ENDPOINT}/{S3_BUCKET}; set explicitly behind a CDN/custom domain.
  S3_PUBLIC_URL: Joi.string().uri().optional().allow(''),

  // Khalti KPG-2 (PAY-2) — gateway enabled only when the secret key is set;
  // otherwise disabled with a boot notice (initiate → 503). Base URL default
  // is the sandbox; going live = swapping these two.
  KHALTI_SECRET_KEY: Joi.string().optional().allow(''),
  KHALTI_BASE_URL: Joi.string().uri().default('https://dev.khalti.com/api/v2'),

  // eSewa ePay v2 (PAY-1) — gateway is enabled only when BOTH product code and
  // secret are set; otherwise disabled with a boot notice (initiate → 503).
  // URL defaults are the rc/UAT sandbox; going live = swapping these four.
  ESEWA_PRODUCT_CODE: Joi.string().optional().allow(''),
  ESEWA_SECRET_KEY: Joi.string().optional().allow(''),
  ESEWA_FORM_URL: Joi.string().uri().default('https://rc-epay.esewa.com.np/api/epay/main/v2/form'),
  ESEWA_STATUS_URL: Joi.string().uri().default('https://rc.esewa.com.np/api/epay/transaction/status/'),
  // Public base URLs for gateway redirects: where eSewa sends the payer's
  // browser back (API) and where our callbacks land the payer (web).
  API_PUBLIC_URL: Joi.string().uri().optional().allow(''),
  WEB_BASE_URL: Joi.string().uri().optional().allow(''),
});
