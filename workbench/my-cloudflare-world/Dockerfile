FROM node:20-alpine

WORKDIR /app

# Copy manifest and packaged runtime
COPY package.json workflow-cloudflare-world-*.tgz ./

# Install production dependencies (file: tarball is picked up here)
RUN npm install --omit=dev --legacy-peer-deps \
 && npm cache clean --force

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nodejs
USER nodejs

EXPOSE 8080
CMD ["node", "./node_modules/workflow-cloudflare-world/dist/src/container-executor.js"]
