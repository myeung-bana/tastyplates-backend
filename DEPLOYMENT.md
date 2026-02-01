# Deployment Guide

## ✅ Setup Complete!

Your backend is now configured for **Nhost Run** deployment with:

- ✅ Express server running on port 4000
- ✅ Nhost Run configuration in `nhost.toml`
- ✅ Production-ready Dockerfile
- ✅ All dependencies installed
- ✅ TypeScript type-checking passes

---

## 🚀 Next Steps

### 1. Test Locally

Start the Nhost services and your backend:

```bash
# Terminal 1: Start Nhost (Postgres + Hasura)
nhost up

# Terminal 2: Start backend server
yarn dev
```

Test the health endpoint:

```bash
curl http://localhost:4000/healthz
```

Expected response:
```json
{
  "ok": true,
  "service": "tastyplates-backend",
  "timestamp": "2026-01-31T..."
}
```

---

### 2. Link to Nhost Cloud

If you haven't already:

```bash
# Login to Nhost
nhost login

# Link this project to your Nhost cloud project
nhost link
```

This will create `.nhost/nhost.yaml` with your project configuration.

---

### 3. Deploy to Nhost Run

```bash
nhost deploy
```

This command will:
1. Package your code
2. Build the Docker image
3. Deploy to Nhost Run
4. Provide a public URL like: `https://backend-[id].[region].nhost.run`

---

### 4. Configure Environment Variables

Go to [Nhost Dashboard](https://app.nhost.io):

1. Select your project
2. Navigate to **Run** → **backend** service
3. Click **Environment Variables**
4. Add these variables:

```bash
# Hasura (get these from Nhost project settings)
HASURA_GRAPHQL_ADMIN_SECRET=your-admin-secret
HASURA_GRAPHQL_URL=https://[subdomain].nhost.run/v1/graphql

# Upstash Redis (if using rate limiting/caching)
UPSTASH_REDIS_REST_URL=your-upstash-url
UPSTASH_REDIS_REST_TOKEN=your-upstash-token

# Frontend URL (for CORS and photo proxy)
NEXT_PUBLIC_APP_URL=https://yourdomain.com

# S3 (if keeping S3 + Sharp for uploads)
S3_ACCESS_KEY_ID=your-key
S3_SECRET_ACCESS_KEY=your-secret
S3_REGION=ap-northeast-2
S3_BUCKET_NAME=your-bucket
S3_BUCKET_DOMAIN=your-domain

# Image optimization (optional)
IMAGE_MAX_WIDTH=1600
IMAGE_MAX_HEIGHT=1600
IMAGE_AVIF_QUALITY=60
IMAGE_WEBP_QUALITY=75
```

---

### 5. Update Frontend Configuration

In your `tastyplates-v2-1` project:

**Create/update `.env.local`:**

```bash
# Development - points to local backend
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000

# Production - uncomment and update after deploying
# NEXT_PUBLIC_BACKEND_URL=https://backend-[id].[region].nhost.run
```

**Update your service files** (e.g., `restaurantV2Service.ts`):

```typescript
const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

// Change API calls from:
fetch('/api/v1/restaurants-v2/match-restaurant', options)

// To:
fetch(`${API_BASE}/api/v1/restaurants-v2/match-restaurant`, options)
```

---

## 🤖 Adding AI Services

Ready to add Gemini or other AI services? Here's how:

### Install AI SDK

```bash
# For Google Gemini
yarn add @google/generative-ai

# Or for OpenAI
yarn add openai

# Or for Anthropic Claude
yarn add @anthropic-ai/sdk
```

### Create an AI Route

**Example: `src/routes/api/v1/ai/chat.ts`**

```typescript
import type { Request, Response } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function chat(req: Request, res: Response) {
  try {
    const { message, conversationHistory } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

    // For streaming responses (recommended for better UX)
    const result = await model.generateContentStream(message);
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    for await (const chunk of result.stream) {
      const text = chunk.text();
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('AI chat error:', error);
    res.status(500).json({ error: 'AI service failed' });
  }
}
```

### Register the Route

Add to `src/index.ts`:

```typescript
import { chat } from './routes/api/v1/ai/chat.js';

// ... other routes ...

app.post('/api/v1/ai/chat', chat);
```

### Add Environment Variable

Add to your Nhost environment variables:

```bash
GEMINI_API_KEY=your-api-key
```

And to `env.example`:

```bash
# AI Service (Gemini)
GEMINI_API_KEY=replace-me
```

---

## 📊 Monitoring

After deployment, monitor your service in Nhost Dashboard:

- **Logs**: View real-time logs from your Express server
- **Metrics**: CPU, memory usage, request rates
- **Health**: Automated health checks via `/healthz`

---

## 🔧 Troubleshooting

### Build fails on Nhost

1. Check logs: `nhost logs -f backend`
2. Verify Dockerfile runs locally:
   ```bash
   docker build -t test-backend .
   docker run -p 4000:4000 test-backend
   ```

### Health check fails

1. Ensure server starts on port 4000 (or PORT env var)
2. Check `/healthz` returns 200 status
3. Verify `initialDelaySeconds` in `nhost.toml` is long enough

### Frontend can't reach backend

1. Verify CORS is enabled (already configured in `src/index.ts`)
2. Check `NEXT_PUBLIC_BACKEND_URL` is set correctly
3. Ensure backend is deployed and running

---

## 📝 What's Next?

1. ✅ Test locally (`yarn dev`)
2. ✅ Deploy to Nhost (`nhost deploy`)
3. ⬜ Set environment variables in Nhost Dashboard
4. ⬜ Update frontend to use backend URL
5. ⬜ Implement remaining API routes (following feed, uploads)
6. ⬜ Add AI services (Gemini/OpenAI)
7. ⬜ Test end-to-end with frontend

---

**Need help?** Check the [Nhost Run docs](https://docs.nhost.io/run) or the main README.md.
