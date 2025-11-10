# Multi-stage Dockerfile for SvelteKit Cloudflare container
# - By default this Dockerfile performs an in-image build (builder stage) and copies
#   the generated runtime artifacts into a minimal runtime image.
# - If you prefer to prebuild locally and provide the `.svelte-kit` artifacts in the
#   build context, you can pass `--build-arg BUILD_IN_IMAGE=false` and ensure the
#   `.svelte-kit` directory is included in the build context (remove it from
#   .dockerignore).
#
# Usage examples:
#  - In-image build (default): docker build -t my-image .
#    (or: docker build --build-arg BUILD_IN_IMAGE=true -t my-image .)
#
#  - Use prebuilt artifacts from context:
#    1) Remove `.svelte-kit` from .dockerignore (so Docker context includes it)
#    2) Run: docker build --build-arg BUILD_IN_IMAGE=false -t my-image .
#
# Note: This Dockerfile uses Node 18 Alpine. It installs pnpm via corepack so it
# works with pnpm-based projects.

########################
# Builder stage
########################
ARG BUILD_IN_IMAGE=true
FROM node:18-alpine AS builder

# build-time args are available here
ARG BUILD_IN_IMAGE

WORKDIR /build

# Reduce image size: use production env during builds where possible
ENV NODE_ENV=production

# Install basic build deps (git may be needed for some workspaces)
RUN apk add --no-cache bash git curl build-base python3

# Use corepack to enable pnpm (Node 18 has corepack)
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy manifest files first for better cache usage.
# If your project uses pnpm workspaces, include pnpm-workspace.yaml and any root configs.
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./

# Copy the rest of the repository into the builder. NOTE:
# This COPY obeys .dockerignore. If you intend to build in-image, ensure .dockerignore
# does not exclude `src` or other files required to produce `.svelte-kit`.
COPY . .

# Install dependencies and run the user build only when BUILD_IN_IMAGE=true.
# If BUILD_IN_IMAGE=false, we skip package install/build here and expect prebuilt
# artifacts to be present in the build context.
RUN if [ "$BUILD_IN_IMAGE" = "true" ]; then \
      pnpm install --frozen-lockfile --offline=false --prefer-offline || pnpm install --frozen-lockfile ; \
      pnpm build ; \
    else \
      echo "Skipping in-image build (BUILD_IN_IMAGE=false)"; \
    fi

# Ensure artifacts directory exists even if build didn't run. Populate it if build ran.
RUN mkdir -p /build/artifacts && \
    if [ -d .svelte-kit/output/server ]; then \
      cp -a .svelte-kit/output/server /build/artifacts/server ; \
    fi && \
    if [ -f .svelte-kit/cloudflare/_worker.js ]; then \
      cp .svelte-kit/cloudflare/_worker.js /build/artifacts/_worker.js ; \
    fi

########################
# Final runtime image
########################
FROM node:18-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Create a non-root user (match previous behavior)
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nodejs

# Copy artifacts prepared by the builder stage into the final image.
# The builder always creates /build/artifacts (may be empty) so the COPY will succeed.
COPY --from=builder /build/artifacts /artifacts

# If the build artifacts were provided directly in the build context (prebuilt),
# copy them into the image as well. This COPY will succeed only if those paths exist
# in the build context; if you use prebuilt artifacts, ensure .svelte-kit is included
# in the Docker context (remove it from .dockerignore).
#
# We attempt to copy them into /context-artifacts so we can reconcile both sources.
COPY .svelte-kit/output/server /context-artifacts/server
COPY .svelte-kit/cloudflare/_worker.js /context-artifacts/_worker.js

# At image build time reconcile artifacts: prefer context-provided, then builder-produced.
# Use a small shell step to move whichever artifacts are available into /app.
RUN mkdir -p /app && \
    # If context-provided server exists, use it; otherwise, fallback to builder artifacts
    if [ -d /context-artifacts/server ]; then \
      cp -a /context-artifacts/server /app/server ; \
    elif [ -d /artifacts/server ]; then \
      cp -a /artifacts/server /app/server ; \
    fi && \
    # Worker wrapper: prefer context, else builder
    if [ -f /context-artifacts/_worker.js ]; then \
      cp /context-artifacts/_worker.js /app/_worker.js ; \
    elif [ -f /artifacts/_worker.js ]; then \
      cp /artifacts/_worker.js /app/_worker.js ; \
    fi && \
    # Clean up temporary artifact dirs to keep image tidy
    rm -rf /artifacts /context-artifacts || true

# Set permissions and switch to non-root user
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose the port SvelteKit/Cloudflare worker expects (for local container debug)
EXPOSE 8080

# Start the runtime worker
CMD ["node", "_worker.js"]
