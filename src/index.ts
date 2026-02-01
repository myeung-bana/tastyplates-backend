import express from 'express';
import cors from 'cors';
import { healthz } from './routes/healthz.js';
import { matchRestaurant } from './routes/api/v1/restaurants-v2/match-restaurant.js';
import { downloadGooglePhoto } from './routes/api/v1/images/download-google-photo.js';
import { getFollowingFeed } from './routes/api/v1/restaurant-reviews/get-following-feed.js';
import { uploadImage } from './routes/api/v1/upload/image.js';
import { uploadBatch } from './routes/api/v1/upload/batch.js';

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check
app.get('/healthz', healthz);

// API routes (mirrors frontend expectations: /api/v1/...)
app.post('/api/v1/restaurants-v2/match-restaurant', matchRestaurant);
app.post('/api/v1/images/download-google-photo', downloadGooglePhoto);
app.get('/api/v1/restaurant-reviews/get-following-feed', getFollowingFeed);
app.post('/api/v1/upload/image', uploadImage);
app.post('/api/v1/upload/batch', uploadBatch);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Tastyplates backend listening on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/healthz`);
});
