import { z } from 'zod';

const INSECURE_PLACEHOLDERS = new Set([
  'your-secure-256-bit-jwt-secret',
  'replace-with-a-cryptographically-secure-256-bit-secret-key',
  'faisaa_production_jwt_secret_change_me_in_env_2026',
  'finora_super_secret_jwt_key_2026_production_ready',
  'secret',
  'changeme',
]);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(5001),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z
    .string()
    .min(1, 'JWT_SECRET is required')
    .default('finora_super_secret_jwt_key_2026_production_ready'),
  ACCESS_TOKEN_EXPIRES_IN: z.string().default('15m'),
  CLIENT_URL: z.string().optional(),
  FRONTEND_URL: z.string().optional(),
  SEED_DEMO: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  REDIS_URL: z.string().optional(),
  VALKEY_URL: z.string().optional(),
  DATABASE_READ_URL: z.string().optional(),
});

export type ValidatedEnv = z.infer<typeof envSchema>;

let validatedEnv: ValidatedEnv | null = null;

export function validateEnv(): ValidatedEnv {
  if (validatedEnv) return validatedEnv;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ FATAL: Invalid or missing environment configuration:');
    for (const issue of result.error.issues) {
      console.error(`   - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  const env = result.data;

  // Strict production cryptographic check
  if (env.NODE_ENV === 'production') {
    if (INSECURE_PLACEHOLDERS.has(env.JWT_SECRET) || env.JWT_SECRET.length < 32) {
      console.error(
        '❌ FATAL: In production, JWT_SECRET must be a cryptographically strong secret with at least 32 characters.'
      );
      process.exit(1);
    }
  }

  validatedEnv = env;
  return env;
}

export function getEnv(): ValidatedEnv {
  if (!validatedEnv) {
    return validateEnv();
  }
  return validatedEnv;
}
