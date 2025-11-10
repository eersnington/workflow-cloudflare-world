# Minimal runtime-only Dockerfile for SvelteKit Cloudflare worker
#
# Assumptions:
# - The SvelteKit build has already been run and the following artifacts exist in
#   the build context (i.e., they are included when Docker builds):
#     .svelte-kit/output/server
#     .svelte-kit/cloudflare/_worker.js
# - If you use a .dockerignore, ensure `.svelte-kit` is NOT excluded from the context
#   (remove/comment the `.svelte-kit` line) so Docker can copy the prebuilt artifacts.
#
# This image is intentionally minimal: it contains only the runtime bundle required
# to run the Cloudflare worker wrapper produced by the Cloudflare SvelteKit adapter.

FROM node:18-alpine

WORKDIR /app
ENV NODE_ENV=production

# Create a non-root user for running the worker
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs nodejs

# Copy only the runtime bundle and Cloudflare worker wrapper into the image.
# These paths must exist in the build context (prebuilt).
COPY .svelte-kit/output/server ./server
COPY .svelte-kit/cloudflare/_worker.js ./

# Ensure files are readable by the node user
RUN chown -R nodejs:nodejs /app || true

# Port is exposed for local debugging (Cloudflare runtime typically ignores this)
EXPOSE 8080

USER nodejs

# Start the Cloudflare worker wrapper
CMD ["node", "_worker.js"]
