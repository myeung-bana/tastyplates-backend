# Tastyplates Backend — Client Integration Guide

This document is the single source of truth for connecting any client (web app, native app, or future admin portal) to the new Nhost backend. It maps every old Next.js `/api/v1/...` route to its new equivalent and provides copy-ready code patterns.

---

## Table of Contents

1. [Environment Setup](#environment-setup)
2. [Complete Route Mapping Table](#complete-route-mapping-table)
3. [Code Patterns for Switching Service Calls](#code-patterns-for-switching-service-calls)
4. [Checklist for Retiring Old Routes](#checklist-for-retiring-old-routes)

---

## Environment Setup

Add the following variables to `tastyplates-v2-1/.env.local`:

```env
# Nhost project identifiers (already present)
NEXT_PUBLIC_NHOST_SUBDOMAIN=<your-subdomain>
NEXT_PUBLIC_NHOST_REGION=<your-region>

# Hasura GraphQL endpoint (already present)
NEXT_PUBLIC_HASURA_GRAPHQL_API_URL=https://<subdomain>.hasura.<region>.nhost.run/v1/graphql

# NEW: Nhost Functions base URL
NEXT_PUBLIC_NHOST_FUNCTIONS_URL=https://<subdomain>.functions.<region>.nhost.run/v0

# NEW: API mode feature flag
# Set to "nhost" to use new backend, "legacy" to fall back to /api/v1 routes
NEXT_PUBLIC_API_MODE=nhost
```

---

## Complete Route Mapping Table

### Legend

- **Direct GraphQL** — call `nhost.graphql.request(QUERY, vars)` from the client
- **Nhost Function** — call `fetch(NEXT_PUBLIC_NHOST_FUNCTIONS_URL + path)` with JWT
- **Deprecated** — no replacement needed (dev tool, Firebase-specific, or removed)

---

### Upload Routes

| Old route | Method | New endpoint | Type | Notes |
|-----------|--------|-------------|------|-------|
| `/api/v1/upload/image` | POST | `/uploads/image` | Nhost Function | multipart/form-data, returns `{ fileUrl, filePath }` |
| `/api/v1/upload/batch` | POST | `/uploads/batch` | Nhost Function | multipart/form-data, up to 10 files |

---

### Image Routes

| Old route | Method | New endpoint | Type | Notes |
|-----------|--------|-------------|------|-------|
| `/api/v1/images/download-google-photo` | POST | `/images/download-google-photo` | Nhost Function | Body: `{ photoUrl }`, returns `{ data: "data:image/...;base64,..." }` |

---

### Restaurant Routes

| Old route | Method | New endpoint | Type | Notes |
|-----------|--------|-------------|------|-------|
| `/api/v1/restaurants-v2/get-restaurants` | GET | `/restaurants/search` | Nhost Function | All query params identical; returns `{ success, data, meta }` |
| `/api/v1/restaurants-v2/match-restaurant` | POST | `/restaurants/match` | Nhost Function | Body: `{ place_id?, name?, address?, latitude?, longitude? }` |
| `/api/v1/restaurants-v2/get-restaurant-by-id` | GET | `GetRestaurantByUuid` | Direct GraphQL | Query by `uuid` or `slug` |
| `/api/v1/restaurants-v2/get-rating-summary` | GET | `GetRatingSummary` | Direct GraphQL | Query `restaurant_rating_summary` by `restaurant_id` |
| `/api/v1/restaurants-v2/get-authentic-stats` | GET | `GetAuthenticStats` | Direct GraphQL | Query `restaurant_rating_summary` for authentic fields |
| `/api/v1/restaurants-v2/get-preference-stats` | GET | `GetPreferenceStats` | Direct GraphQL | Query by cuisine/palate aggregates |
| `/api/v1/restaurants-v2/create-restaurant` | POST | `CreateRestaurant` | Direct GraphQL | Requires `admin` role JWT |
| `/api/v1/featured-restaurants` | GET | `GetFeaturedRestaurants` | Direct GraphQL | Filter: `is_featured: { _eq: true }` on `restaurants` |
| `/api/v1/restaurants-v2/test-connection` | GET | — | **Deprecated** | Dev-only health check; remove entirely |

---

### Review Routes

| Old route | Method | New endpoint | Type | Notes |
|-----------|--------|-------------|------|-------|
| `/api/v1/restaurant-reviews/create-review` | POST | `/reviews/create` | Nhost Function | Body: `{ restaurant_uuid, author_id, content, rating, ... }` |
| `/api/v1/restaurant-reviews/create-comment` | POST | `/reviews/create-comment` | Nhost Function | Body: `{ parent_review_id, author_id, content }` |
| `/api/v1/restaurant-reviews/update-review` | PUT | `/reviews/update` | Nhost Function | Body: `{ id, content?, rating?, status?, ... }` |
| `/api/v1/restaurant-reviews/delete-review` | DELETE | `/reviews/delete` | Nhost Function | Query: `?id=<uuid>` |
| `/api/v1/restaurant-reviews/get-following-feed` | GET | `/reviews/following-feed` | Nhost Function | Query: `?user_id=<uuid>&limit=10&cursor=...` |
| `/api/v1/restaurant-reviews/get-all-reviews` | GET | `GetAllReviewsWithNhostAuthors` | Direct GraphQL | Paginated query on `restaurant_reviews` |
| `/api/v1/restaurant-reviews/get-review-by-id` | GET | `GetReviewById` | Direct GraphQL | Query `restaurant_reviews_by_pk(id)` |
| `/api/v1/restaurant-reviews/get-reviews-by-restaurant` | GET | `GetReviewsByRestaurant` | Direct GraphQL | Filter by `restaurant_uuid` |
| `/api/v1/restaurant-reviews/get-user-reviews` | GET | `GetUserReviews` | Direct GraphQL | Filter by `author_id` |
| `/api/v1/restaurant-reviews/get-draft-reviews` | GET | `GetUserDraftReviews` | Direct GraphQL | Filter: `author_id` + `status: draft` |
| `/api/v1/restaurant-reviews/get-replies` | GET | `GetReviewReplies` | Direct GraphQL | Filter by `parent_review_id` |
| `/api/v1/restaurant-reviews/toggle-like` | POST | `InsertReviewLike` / `DeleteReviewLike` | Direct GraphQL | Check status first with `CheckReviewLike`, then insert or delete |

---

### User Routes

| Old route | Method | New endpoint | Type | Notes |
|-----------|--------|-------------|------|-------|
| `/api/user/me` | GET | `/users/me` | Nhost Function | Returns user profile from `restaurant_users` using JWT |
| `/api/v1/restaurant-users/suggested` | GET | `/users/suggested` | Nhost Function | Query: `?limit=6`, optional auth header |
| `/api/v1/restaurant-users/follow` | POST | `/users/follow` | Nhost Function | Requires JWT; body: `{ user_id }` |
| `/api/v1/restaurant-users/unfollow` | POST | `/users/unfollow` | Nhost Function | Requires JWT; body: `{ user_id }` |
| `/api/v1/restaurant-users/delete-restaurant-user` | DELETE | `/users/delete` | Nhost Function | Query: `?id=<uuid>&hard_delete=false` |
| `/api/v1/restaurant-users/update-restaurant-user` | PUT | `UpdateRestaurantUser` | Direct GraphQL | `user` role can only update own row |
| `/api/v1/restaurant-users/create-restaurant-user` | POST | `CreateRestaurantUser` | Direct GraphQL | Called during onboarding with user JWT |
| `/api/v1/restaurant-users/get-restaurant-user-by-id` | GET | `GetRestaurantUserById` | Direct GraphQL | Query `restaurant_users_by_pk(id)` |
| `/api/v1/restaurant-users/get-restaurant-user-by-username` | GET | `GetRestaurantUserByUsername` | Direct GraphQL | Filter by `username` |
| `/api/v1/restaurant-users/get-restaurant-users` | GET | `GetAllRestaurantUsers` | Direct GraphQL | Paginated list |
| `/api/v1/restaurant-users/get-reviews` | GET | `GetUserReviews` | Direct GraphQL | Alias for review query filtered by `author_id` |
| `/api/v1/restaurant-users/check-follow-status` | GET | `CheckFollowStatus` | Direct GraphQL | Query `restaurant_user_follows` by `follower_id + user_id` |
| `/api/v1/restaurant-users/check-username` | GET | `CheckUsername` | Direct GraphQL | Query `restaurant_users` where `username: { _eq: ... }` |
| `/api/v1/restaurant-users/get-followers-list` | GET | `GetFollowersList` | Direct GraphQL | Query `restaurant_user_follows` by `user_id` |
| `/api/v1/restaurant-users/get-following-list` | GET | `GetFollowingList` | Direct GraphQL | Query `restaurant_user_follows` by `follower_id` |
| `/api/v1/restaurant-users/get-followers-count` | GET | `GetFollowersCount` | Direct GraphQL | Aggregate on `restaurant_user_follows` |
| `/api/v1/restaurant-users/get-following-count` | GET | `GetFollowingCount` | Direct GraphQL | Aggregate on `restaurant_user_follows` |
| `/api/v1/restaurant-users/get-wishlist` | GET | `GetWishlist` | Direct GraphQL | Query wishlist/favorite table by `user_id` |
| `/api/v1/restaurant-users/get-checkins` | GET | `GetCheckins` | Direct GraphQL | Query checkins table by `user_id` |
| `/api/v1/restaurant-users/toggle-favorite` | POST | `ToggleFavorite` | Direct GraphQL | Insert/delete on wishlist table, `user` role |
| `/api/v1/restaurant-users/toggle-checkin` | POST | `ToggleCheckin` | Direct GraphQL | Insert/delete on checkins table, `user` role |
| `/api/v1/restaurant-users/get-restaurant-user-by-firebase-uuid` | GET | — | **Deprecated** | Firebase removed; use Nhost `user.id` instead |

---

### Taxonomy / Content Routes (all → Direct GraphQL)

| Old route | New GraphQL operation | Notes |
|-----------|----------------------|-------|
| `/api/v1/cuisines/get-cuisines` | `GetCuisines` | Query `cuisines` table |
| `/api/v1/cuisines/get-cuisine-by-id` | `GetCuisineById` | `cuisines_by_pk(id)` |
| `/api/v1/palates/get-palates` | `GetPalates` | Query `palates` table |
| `/api/v1/palates/get-palate-by-id` | `GetPalateById` | `palates_by_pk(id)` |
| `/api/v1/categories/get-categories` | `GetCategories` | Query `categories` table |
| `/api/v1/categories/get-category-by-id` | `GetCategoryById` | `categories_by_pk(id)` |
| `/api/v1/price-ranges/get-price-ranges` | `GetPriceRanges` | Query `price_ranges` table |
| `/api/v1/price-ranges/get-price-range-by-id` | `GetPriceRangeById` | `price_ranges_by_pk(id)` |
| `/api/v1/locations/get-locations` | `GetLocations` | Query `locations` table |
| `/api/v1/articles/get-articles` | `GetArticles` | Query `articles` table |
| `/api/v1/articles/get-article-by-id` | `GetArticleById` | `articles_by_pk(id)` |
| `/api/v1/articles/get-article-by-slug` | `GetArticleBySlug` | Filter by `slug` |
| `/api/v1/content/[type]` | `GetContentByType` | Filter by `type` |

---

### Admin / Monitoring Routes

| Old route | Method | New endpoint | Type | Notes |
|-----------|--------|-------------|------|-------|
| `/api/v1/admin/backfill-rating-summary` | POST | `/admin/backfill-rating-summary` | Nhost Function | Header: `x-admin-secret` |
| `/api/v1/monitoring/graphql-stats` | GET | `/admin/monitoring` | Nhost Function | Header: `x-admin-secret`; prod-safe |

---

## Code Patterns for Switching Service Calls

### Pattern 1: Feature Flag (`NEXT_PUBLIC_API_MODE`)

Use this to gradually migrate each service file:

```typescript
const API_MODE = process.env.NEXT_PUBLIC_API_MODE || 'legacy';
const FUNCTIONS_URL = process.env.NEXT_PUBLIC_NHOST_FUNCTIONS_URL;

export async function getRestaurants(params: RestaurantSearchParams) {
  if (API_MODE === 'nhost') {
    const query = new URLSearchParams(params as any).toString();
    const res = await fetch(`${FUNCTIONS_URL}/restaurants/search?${query}`);
    return res.json();
  }
  // Legacy path
  return legacyGetRestaurants(params);
}
```

### Pattern 2: Direct GraphQL call (taxonomy / simple reads)

```typescript
import { nhost } from '@/lib/nhost';

const GET_CUISINES = `
  query GetCuisines {
    cuisines(order_by: { name: asc }) {
      id slug name
    }
  }
`;

export async function getCuisines() {
  const { data, error } = await nhost.graphql.request(GET_CUISINES);
  if (error) throw new Error(error.message);
  return data.cuisines;
}
```

### Pattern 3: Nhost Function call with JWT

```typescript
import { nhost } from '@/lib/nhost';

export async function createReview(payload: ReviewCreatePayload) {
  const token = nhost.auth.getAccessToken();
  const res = await fetch(`${FUNCTIONS_URL}/reviews/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token ? `Bearer ${token}` : '',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Failed to create review');
  return data.data;
}
```

### Pattern 4: File upload to Nhost Function

```typescript
export async function uploadImage(file: File) {
  const token = nhost.auth.getAccessToken();
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${FUNCTIONS_URL}/uploads/image`, {
    method: 'POST',
    headers: { Authorization: token ? `Bearer ${token}` : '' },
    body: formData,
  });

  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Upload failed');
  return data.fileUrl as string;
}
```

---

## Checklist for Retiring Old Routes

Work through this checklist **per domain**. Only delete a route file after the corresponding Nhost endpoint is live and the service call is updated.

### Uploads

- [ ] Update `restaurantV2Service` upload calls to use `${FUNCTIONS_URL}/uploads/image`
- [ ] Update batch upload calls to use `${FUNCTIONS_URL}/uploads/batch`
- [ ] Delete `src/app/api/v1/upload/image/route.ts`
- [ ] Delete `src/app/api/v1/upload/batch/route.ts`

### Images

- [ ] Update Google photo proxy calls to use `${FUNCTIONS_URL}/images/download-google-photo`
- [ ] Delete `src/app/api/v1/images/download-google-photo/route.ts`

### Restaurants

- [ ] Update `restaurantV2Service.getRestaurants()` to use `/restaurants/search` function
- [ ] Update `restaurantV2Service.matchRestaurant()` to use `/restaurants/match` function
- [ ] Update `getRestaurantBySlug/ById` to use direct GraphQL
- [ ] Update rating summary reads to use direct GraphQL
- [ ] Delete `src/app/api/v1/restaurants-v2/get-restaurants/route.ts`
- [ ] Delete `src/app/api/v1/restaurants-v2/match-restaurant/route.ts`
- [ ] Delete `src/app/api/v1/restaurants-v2/get-restaurant-by-id/route.ts`
- [ ] Delete `src/app/api/v1/restaurants-v2/get-rating-summary/route.ts`
- [ ] Delete `src/app/api/v1/restaurants-v2/get-authentic-stats/route.ts`
- [ ] Delete `src/app/api/v1/restaurants-v2/get-preference-stats/route.ts`
- [ ] Delete `src/app/api/v1/restaurants-v2/create-restaurant/route.ts`
- [ ] Delete `src/app/api/v1/restaurants-v2/test-connection/route.ts`
- [ ] Delete `src/app/api/v1/featured-restaurants/route.ts`

### Reviews

- [ ] Update `reviewV2Service.createReview()` → `/reviews/create`
- [ ] Update `reviewV2Service.createComment()` → `/reviews/create-comment`
- [ ] Update `reviewV2Service.updateReview()` → `/reviews/update`
- [ ] Update `reviewV2Service.deleteReview()` → `/reviews/delete`
- [ ] Update `reviewV2Service.getFollowingFeed()` → `/reviews/following-feed`
- [ ] Update all read queries to use direct GraphQL
- [ ] Update like/unlike to use direct GraphQL mutations
- [ ] Delete `src/app/api/v1/restaurant-reviews/create-review/route.ts`
- [ ] Delete `src/app/api/v1/restaurant-reviews/create-comment/route.ts`
- [ ] Delete `src/app/api/v1/restaurant-reviews/update-review/route.ts`
- [ ] Delete `src/app/api/v1/restaurant-reviews/delete-review/route.ts`
- [ ] Delete `src/app/api/v1/restaurant-reviews/get-following-feed/route.ts`
- [ ] Delete `src/app/api/v1/restaurant-reviews/get-all-reviews/route.ts`
- [ ] Delete `src/app/api/v1/restaurant-reviews/get-review-by-id/route.ts`
- [ ] Delete `src/app/api/v1/restaurant-reviews/get-reviews-by-restaurant/route.ts`
- [ ] Delete `src/app/api/v1/restaurant-reviews/get-user-reviews/route.ts`
- [ ] Delete `src/app/api/v1/restaurant-reviews/get-draft-reviews/route.ts`
- [ ] Delete `src/app/api/v1/restaurant-reviews/get-replies/route.ts`
- [ ] Delete `src/app/api/v1/restaurant-reviews/toggle-like/route.ts`

### Users

- [ ] Update `restaurantUserService.getMe()` → `/users/me`
- [ ] Update `restaurantUserService.follow()` → `/users/follow`
- [ ] Update `restaurantUserService.unfollow()` → `/users/unfollow`
- [ ] Update `restaurantUserService.getSuggestedUsers()` → `/users/suggested`
- [ ] Update `restaurantUserService.deleteUser()` → `/users/delete`
- [ ] Update all read/write user operations to use direct GraphQL
- [ ] Remove Firebase UUID lookup entirely (`get-restaurant-user-by-firebase-uuid`)
- [ ] Delete `src/app/api/user/me/route.ts`
- [ ] Delete `src/app/api/v1/restaurant-users/suggested/route.ts`
- [ ] Delete `src/app/api/v1/restaurant-users/follow/route.ts`
- [ ] Delete `src/app/api/v1/restaurant-users/unfollow/route.ts`
- [ ] Delete `src/app/api/v1/restaurant-users/delete-restaurant-user/route.ts`
- [ ] Delete `src/app/api/v1/restaurant-users/get-restaurant-user-by-firebase-uuid/route.ts`
- [ ] Delete all remaining `src/app/api/v1/restaurant-users/*.ts` route files

### Taxonomy & Content (all direct GraphQL — just delete the old proxies)

- [ ] Delete `src/app/api/v1/cuisines/` directory
- [ ] Delete `src/app/api/v1/palates/` directory
- [ ] Delete `src/app/api/v1/categories/` directory
- [ ] Delete `src/app/api/v1/price-ranges/` directory
- [ ] Delete `src/app/api/v1/locations/` directory
- [ ] Delete `src/app/api/v1/articles/` directory
- [ ] Delete `src/app/api/v1/content/` directory

### Admin & Monitoring

- [ ] Remove or guard `/api/v1/admin/backfill-rating-summary` (replaced by function)
- [ ] Remove or guard `/api/v1/monitoring/graphql-stats` (replaced by `/admin/monitoring`)
- [ ] Delete `src/app/api/v1/admin/` directory
- [ ] Delete `src/app/api/v1/monitoring/` directory
