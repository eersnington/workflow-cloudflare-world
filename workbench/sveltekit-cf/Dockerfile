# Use Node.js 18 Alpine as base image
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN \
  if [ -f "pnpm-lock.yaml" ]; then \
    corepack enable pnpm && pnpm install --frozen-lockfile; \
  elif [ -f "yarn.lock" ]; then \
    yarn install --frozen-lockfile; \
  elif [ -f "package-lock.json" ]; then \
    npm ci; \
  else \
    echo "Lockfile not found." && exit 1; \
  fi

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the application
RUN \
  if [ -f "pnpm-lock.yaml" ]; then \
    corepack enable pnpm && pnpm run build; \
  elif [ -f "yarn.lock" ]; then \
    yarn run build; \
  else \
    npm run build; \
  fi

# Production image, copy all the files and run the app
FROM node:18-alpine AS runner
WORKDIR /app

ENV NODE_ENV production

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

# Copy built application (adjust paths based on your build output)
COPY --from=builder /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./package.json

# Set the correct permissions
RUN mkdir -p /app/dist && chown -R nodejs:nodejs /app

# Expose the port the app runs on
EXPOSE 8080

# Set user to nodejs
USER nodejs

# Start the container
CMD ["node", "dist/index.js"]
