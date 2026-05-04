export interface GraphQLResponse<T = any> {
  data?: T;
  errors?: Array<{ message: string; extensions?: any }>;
}

/** Returns the full GraphQL endpoint URL (e.g. https://xxx.nhost.run/v1/graphql). */
export function getGraphQLUrl(): string {
  if (process.env.HASURA_GRAPHQL_URL) return process.env.HASURA_GRAPHQL_URL;
  const base = process.env.NHOST_HASURA_URL || process.env.HASURA_GRAPHQL_API_URL;
  if (base) return `${base}/v1/graphql`;
  throw new Error('HASURA_GRAPHQL_URL or NHOST_HASURA_URL must be set');
}

/** Returns the base Hasura URL (without /v1/graphql) for health-check pings. */
export function getHasuraBaseUrl(): string {
  const base = process.env.NHOST_HASURA_URL || process.env.HASURA_GRAPHQL_API_URL;
  if (base) return base;
  const full = process.env.HASURA_GRAPHQL_URL;
  if (full) return full.replace(/\/v1\/graphql$/, '');
  throw new Error('HASURA_GRAPHQL_URL or NHOST_HASURA_URL must be set');
}

async function executeGraphQL<T>(
  query: string,
  variables?: Record<string, any>
): Promise<GraphQLResponse<T>> {
  const url = getGraphQLUrl();
  const adminSecret = process.env.HASURA_GRAPHQL_ADMIN_SECRET || '';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': adminSecret,
    },
    body: JSON.stringify({ query, variables: variables ?? {} }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Hasura request failed: ${response.status} ${response.statusText}${text ? ` — ${text}` : ''}`
    );
  }

  return response.json() as Promise<GraphQLResponse<T>>;
}

export function hasuraQuery<T = any>(
  query: string,
  variables?: Record<string, any>
): Promise<GraphQLResponse<T>> {
  return executeGraphQL<T>(query, variables);
}

export function hasuraMutation<T = any>(
  mutation: string,
  variables?: Record<string, any>
): Promise<GraphQLResponse<T>> {
  return executeGraphQL<T>(mutation, variables);
}
