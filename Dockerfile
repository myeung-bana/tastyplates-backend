# Multi-stage build for production
FROM node:18-alpine AS base

WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# Build stage (optional - currently using tsx at runtime)
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Uncomment if you want to compile TypeScript:
# RUN yarn build

# Production stage
FROM base AS runner
ENV NODE_ENV=production

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json

# Copy source code
COPY src ./src
COPY tsconfig.json ./

# Expose port
EXPOSE 4000

# Start server (using tsx for now - change to "node dist/index.js" if you compile)
CMD ["yarn", "start"]
