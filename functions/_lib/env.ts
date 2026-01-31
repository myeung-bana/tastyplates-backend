import { z } from 'zod';

const envSchema = z.object({
  // Hasura (server-only)
  HASURA_GRAPHQL_URL: z.string().url(),
  HASURA_GRAPHQL_ADMIN_SECRET: z.string().min(1),

  // Upstash (optional but recommended)
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),

  // App URL (used for referer defaults in proxies)
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function getEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return parsed.data;
}

