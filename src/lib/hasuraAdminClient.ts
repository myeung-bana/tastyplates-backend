import { getEnv } from './env.js';

export type GraphQLResponse<TData> = {
  data?: TData;
  errors?: Array<{ message: string; extensions?: unknown }>;
};

export async function hasuraAdminQuery<TData = unknown>(
  query: string,
  variables?: Record<string, unknown>
): Promise<GraphQLResponse<TData>> {
  const env = getEnv();

  const res = await fetch(env.HASURA_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hasura-admin-secret': env.HASURA_GRAPHQL_ADMIN_SECRET,
    },
    body: JSON.stringify({
      query,
      variables: variables ?? {},
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Hasura request failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ''}`);
  }

  return (await res.json()) as GraphQLResponse<TData>;
}
