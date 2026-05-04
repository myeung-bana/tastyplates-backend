import { OpenApiGeneratorV31, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  reviewCreateSchema,
  commentCreateSchema,
  reviewUpdateSchema,
  followSchema,
  uuidSchema,
} from './validate';

export const registry = new OpenAPIRegistry();

registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});

const bearerAuth = [{ bearerAuth: [] as string[] }];

const SuccessResponse = (dataShape: z.ZodTypeAny) =>
  z.object({ success: z.literal(true), data: dataShape });

const ErrorResponse = z.object({
  success: z.literal(false),
  error: z.string(),
});

const PaginatedMeta = z.object({
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
  total: z.number().optional(),
});

registry.register('ErrorResponse', ErrorResponse);

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------
registry.registerPath({
  method: 'post',
  path: '/api/v1/uploads/image',
  tags: ['Uploads'],
  summary: 'Upload and process a single image',
  description: 'Accepts multipart/form-data with one image file (≤ 10 MB). Sharp converts it to AVIF/WebP and stores it in S3.',
  security: bearerAuth,
  responses: {
    200: {
      description: 'Image uploaded successfully',
      content: {
        'application/json': {
          schema: SuccessResponse(z.object({ fileUrl: z.string().url(), filePath: z.string() })),
        },
      },
    },
    429: { description: 'Rate limit exceeded' },
    400: { description: 'Unsupported file type or payload too large' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/uploads/batch',
  tags: ['Uploads'],
  summary: 'Batch upload images to S3 (no Sharp processing)',
  description: 'Upload up to 10 images as multipart/form-data. No format conversion is applied.',
  security: bearerAuth,
  responses: {
    200: {
      description: 'Batch upload result',
      content: {
        'application/json': {
          schema: SuccessResponse(
            z.array(z.object({ fileUrl: z.string().url(), filePath: z.string() }))
          ),
        },
      },
    },
    400: { description: 'Bad request' },
    429: { description: 'Rate limit exceeded' },
  },
});

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------
registry.registerPath({
  method: 'post',
  path: '/api/v1/images/download-google-photo',
  tags: ['Images'],
  summary: 'Download a Google Places photo (CORS proxy)',
  request: {
    body: {
      content: { 'application/json': { schema: z.object({ photoUrl: z.string().url() }) } },
      required: true,
    },
  },
  responses: {
    200: { description: 'Image as base64 data URI' },
    400: { description: 'Missing or invalid photoUrl' },
    429: { description: 'Rate limit exceeded' },
  },
});

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------
registry.registerPath({
  method: 'post',
  path: '/api/v1/reviews/create',
  tags: ['Reviews'],
  summary: 'Create a restaurant review',
  description: 'Rate-limited (5 per 30 s per user). Triggers rating summary rebuild and cache invalidation.',
  security: bearerAuth,
  request: {
    body: {
      content: { 'application/json': { schema: reviewCreateSchema } },
      required: true,
    },
  },
  responses: {
    200: { description: 'Review created' },
    400: { description: 'Validation error' },
    429: { description: 'Rate limit exceeded' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/reviews/create-comment',
  tags: ['Reviews'],
  summary: 'Add a comment/reply to a review',
  security: bearerAuth,
  request: {
    body: {
      content: { 'application/json': { schema: commentCreateSchema } },
      required: true,
    },
  },
  responses: {
    200: { description: 'Comment created' },
    400: { description: 'Validation error' },
    429: { description: 'Rate limit exceeded' },
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/reviews/update',
  tags: ['Reviews'],
  summary: 'Update an existing review',
  security: bearerAuth,
  request: {
    body: {
      content: { 'application/json': { schema: reviewUpdateSchema } },
      required: true,
    },
  },
  responses: {
    200: { description: 'Review updated, rating summary rebuilt' },
    400: { description: 'Validation error' },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/reviews/delete',
  tags: ['Reviews'],
  summary: 'Soft-delete a review',
  security: bearerAuth,
  request: { query: z.object({ id: uuidSchema }) },
  responses: {
    200: { description: 'Review deleted, rating summary rebuilt' },
    404: { description: 'Review not found' },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/reviews/following-feed',
  tags: ['Reviews'],
  summary: "Get the authenticated user's following feed",
  description: 'Returns paginated reviews from users the caller follows. Backed by a Redis composition cache.',
  security: bearerAuth,
  request: {
    query: z.object({
      user_id: uuidSchema,
      limit: z.string().optional(),
      cursor: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: 'Following feed',
      content: {
        'application/json': {
          schema: SuccessResponse(z.object({ reviews: z.array(z.any()), meta: PaginatedMeta })),
        },
      },
    },
  },
});

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
registry.registerPath({
  method: 'get',
  path: '/api/v1/users/me',
  tags: ['Users'],
  summary: "Get the current user's profile",
  security: bearerAuth,
  responses: {
    200: { description: 'User profile' },
    401: { description: 'Missing or invalid token' },
    404: { description: 'User not found' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/users/follow',
  tags: ['Users'],
  summary: 'Follow a user',
  security: bearerAuth,
  request: {
    body: { content: { 'application/json': { schema: followSchema } }, required: true },
  },
  responses: {
    200: { description: 'Follow recorded' },
    400: { description: 'Cannot follow yourself or already following' },
    429: { description: 'Rate limit exceeded' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/users/unfollow',
  tags: ['Users'],
  summary: 'Unfollow a user',
  security: bearerAuth,
  request: {
    body: { content: { 'application/json': { schema: followSchema } }, required: true },
  },
  responses: {
    200: { description: 'Unfollowed' },
    429: { description: 'Rate limit exceeded' },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/users/suggested',
  tags: ['Users'],
  summary: 'Get suggested users to follow',
  request: { query: z.object({ limit: z.string().optional() }) },
  responses: {
    200: {
      description: 'Suggested users list',
      content: { 'application/json': { schema: SuccessResponse(z.array(z.any())) } },
    },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/users/delete',
  tags: ['Users'],
  summary: 'Delete own account',
  security: bearerAuth,
  request: {
    query: z.object({ id: uuidSchema, hard_delete: z.string().optional() }),
  },
  responses: {
    200: { description: 'Account deleted' },
    404: { description: 'User not found' },
  },
});

// ---------------------------------------------------------------------------
// Restaurants
// ---------------------------------------------------------------------------
registry.registerPath({
  method: 'get',
  path: '/api/v1/restaurants/search',
  tags: ['Restaurants'],
  summary: 'Search restaurants with filters and sorting',
  request: {
    query: z.object({
      search: z.string().optional(),
      cuisine_ids: z.string().optional(),
      cuisine_slugs: z.string().optional(),
      palate_ids: z.string().optional(),
      sort: z.enum(['smart', 'distance', 'rating', 'newest']).optional(),
      latitude: z.string().optional(),
      longitude: z.string().optional(),
      limit: z.string().optional(),
      cursor: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: 'Paginated restaurant results',
      content: {
        'application/json': {
          schema: SuccessResponse(z.object({ data: z.array(z.any()), meta: PaginatedMeta })),
        },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/restaurants/match',
  tags: ['Restaurants'],
  summary: 'Match a restaurant by Google Place ID, name/address, or coordinates',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            place_id: z.string().optional(),
            name: z.string().optional(),
            address: z.string().optional(),
            latitude: z.number().optional(),
            longitude: z.number().optional(),
          }),
        },
      },
      required: true,
    },
  },
  responses: {
    200: { description: 'Matched restaurant or null' },
    400: { description: 'No search criteria provided' },
  },
});

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
registry.registerPath({
  method: 'post',
  path: '/api/v1/admin/backfill-rating-summary',
  tags: ['Admin'],
  summary: 'Rebuild all restaurant rating summaries',
  description: 'Requires x-admin-secret header matching HASURA_GRAPHQL_ADMIN_SECRET.',
  security: bearerAuth,
  responses: {
    200: { description: 'Backfill completed' },
    401: { description: 'Unauthorized' },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/admin/monitoring',
  tags: ['Admin'],
  summary: 'Operational monitoring snapshot',
  description: 'Returns Redis cache versions and config status. Requires x-admin-secret header.',
  security: bearerAuth,
  responses: {
    200: { description: 'Monitoring data' },
    401: { description: 'Unauthorized' },
  },
});

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------
export function generateOpenAPISpec() {
  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Tastyplates Backend API',
      version: '1.0.0',
      description: 'Standalone Express API powering the Tastyplates platform. Covers uploads, reviews, users, restaurants, and admin operations.',
      contact: { name: 'Tastyplates Engineering' },
    },
    servers: [
      { url: '/api/v1', description: 'Current server (relative)' },
      { url: 'http://localhost:3000/api/v1', description: 'Local dev' },
    ],
  });
}
