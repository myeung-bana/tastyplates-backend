import './lib/env-load'; // must be first — loads .env before any module reads process.env

import express from 'express';
import { validateEnv } from './lib/env';
import healthzRouter from './routes/healthz';
import docsRouter from './routes/docs';

// Route handlers
import downloadGooglePhoto from './routes/api/v1/images/download-google-photo';
import uploadImage from './routes/api/v1/uploads/image';
import uploadBatch from './routes/api/v1/uploads/batch';
import reviewCreate from './routes/api/v1/reviews/create';
import reviewCreateComment from './routes/api/v1/reviews/create-comment';
import reviewUpdate from './routes/api/v1/reviews/update';
import reviewDelete from './routes/api/v1/reviews/delete';
import reviewFollowingFeed from './routes/api/v1/reviews/following-feed';
import userMe from './routes/api/v1/users/me';
import userFollow from './routes/api/v1/users/follow';
import userUnfollow from './routes/api/v1/users/unfollow';
import userSuggested from './routes/api/v1/users/suggested';
import userDelete from './routes/api/v1/users/delete';
import restaurantSearch from './routes/api/v1/restaurants/search';
import restaurantMatch from './routes/api/v1/restaurants/match';
import adminBackfill from './routes/api/v1/admin/backfill-rating-summary';
import adminMonitoring from './routes/api/v1/admin/monitoring';

// Validate environment at startup — fails fast with a clear error message
validateEnv();

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, x-hasura-admin-secret, x-admin-secret'
  );
  next();
});

app.options(/.*/, (_req, res) => res.sendStatus(204));

// ---------------------------------------------------------------------------
// Health + Docs (no /api/v1 prefix — reachable at root)
// ---------------------------------------------------------------------------
app.use(healthzRouter);
app.use(docsRouter);

// ---------------------------------------------------------------------------
// API routes — all under /api/v1
// ---------------------------------------------------------------------------

// Images
app.post('/api/v1/images/download-google-photo', express.json(), downloadGooglePhoto);

// Uploads — multer or raw body; wrap with express.raw for binary intake
app.post('/api/v1/uploads/image', express.raw({ type: '*/*', limit: '15mb' }), uploadImage);
app.post('/api/v1/uploads/batch', express.json({ limit: '50mb' }), uploadBatch);

// Reviews
app.post('/api/v1/reviews/create', express.json(), reviewCreate);
app.post('/api/v1/reviews/create-comment', express.json(), reviewCreateComment);
app.put('/api/v1/reviews/update', express.json(), reviewUpdate);
app.delete('/api/v1/reviews/delete', reviewDelete);
app.get('/api/v1/reviews/following-feed', reviewFollowingFeed);

// Users
app.get('/api/v1/users/me', userMe);
app.post('/api/v1/users/follow', express.json(), userFollow);
app.post('/api/v1/users/unfollow', express.json(), userUnfollow);
app.get('/api/v1/users/suggested', userSuggested);
app.delete('/api/v1/users/delete', userDelete);

// Restaurants
app.get('/api/v1/restaurants/search', restaurantSearch);
app.post('/api/v1/restaurants/match', express.json(), restaurantMatch);

// Admin
app.post('/api/v1/admin/backfill-rating-summary', express.json(), adminBackfill);
app.get('/api/v1/admin/monitoring', adminMonitoring);

// ---------------------------------------------------------------------------
// 404 fallback
// ---------------------------------------------------------------------------
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`\nTastyplates Backend`);
  console.log(`  API:    http://localhost:${PORT}/api/v1/...`);
  console.log(`  Health: http://localhost:${PORT}/healthz`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`  Docs:   http://localhost:${PORT}/docs`);
  }
  console.log('');
});

export default app;
