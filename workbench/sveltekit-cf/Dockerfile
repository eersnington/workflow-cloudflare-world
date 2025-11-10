# SvelteKit Cloudflare/Node-compatible Dockerfile (framework-aware)
FROM node:18-alpine AS runner

WORKDIR /app
ENV NODE_ENV production

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

# Copy SvelteKit Cloudflare worker output (adapter may produce _worker.js)
# Adjust paths if your adapter/runtime differs.
COPY .svelte-kit/cloudflare/_worker.js ./_worker.js

# Set permissions and switch to non-root user
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose the port the container listens on (if applicable)
EXPOSE 8080

# Run the worker entry - adapt if your adapter uses a different file
CMD ["node", "_worker.js"]
