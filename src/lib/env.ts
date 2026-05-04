import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.string().optional().default('development'),

  // Hasura — provide HASURA_GRAPHQL_URL (full endpoint) or NHOST_HASURA_URL (base URL)
  HASURA_GRAPHQL_URL: z.string().url().optional(),
  NHOST_HASURA_URL: z.string().url().optional(),
  HASURA_GRAPHQL_API_URL: z.string().url().optional(),
  HASURA_GRAPHQL_ADMIN_SECRET: z.string().min(1),

  // Nhost Auth — provide NHOST_AUTH_URL or derive from NHOST_SUBDOMAIN + NHOST_REGION
  NHOST_AUTH_URL: z.string().url().optional(),
  NHOST_SUBDOMAIN: z.string().optional(),
  NHOST_REGION: z.string().optional(),

  // Upstash Redis (required for caching and rate limiting)
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),

  // S3 (required for image uploads)
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_REGION: z.string().optional().default('ap-northeast-2'),
  S3_BUCKET_NAME: z.string().optional(),
  S3_BUCKET_DOMAIN: z.string().optional(),

  // Image processing
  IMAGE_MAX_WIDTH: z.string().optional().default('1600'),
  IMAGE_MAX_HEIGHT: z.string().optional().default('1600'),
  IMAGE_AVIF_QUALITY: z.string().optional().default('60'),
  IMAGE_WEBP_QUALITY: z.string().optional().default('75'),

  // Server
  PORT: z.string().optional().default('3000'),
  CORS_ORIGIN: z.string().optional(),

  // App URL (used in Google photo proxy referer)
  APP_URL: z.string().url().optional(),
  NHOST_BACKEND_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const data = parsed.data;
  const hasHasuraUrl = data.HASURA_GRAPHQL_URL || data.NHOST_HASURA_URL || data.HASURA_GRAPHQL_API_URL;
  if (!hasHasuraUrl) {
    throw new Error(
      'Missing env: set HASURA_GRAPHQL_URL (full graphql URL) or NHOST_HASURA_URL (base URL)'
    );
  }

  return data;
}
