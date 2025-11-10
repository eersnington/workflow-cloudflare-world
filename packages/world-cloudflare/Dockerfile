# Workflow Executor Container
# Provides Node.js runtime with vm.runInContext() support for workflow execution

FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Production image, copy all files and run workflow-executor
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 workflow

# Copy built application
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=workflow:nodejs dist/ ./dist/
COPY --chown=workflow:nodejs package.json ./package.json

USER workflow

EXPOSE 8080

ENV PORT 8080

# Run the container executor
CMD ["node", "dist/container-executor.js"]