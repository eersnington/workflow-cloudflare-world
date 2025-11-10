# Container Development Guide

This guide covers the container-based development workflow for the Cloudflare workflow world, including local development, production deployment, and troubleshooting.

## Overview

The Cloudflare workflow world uses a hybrid architecture:
- **Workers**: Handle HTTP requests, queue processing, and orchestration
- **Containers**: Provide Node.js VM execution environment for workflows with `vm.runInContext()` support

## Key Concepts

### Container Execution Model
- **One workflow per container**: Each container processes one workflow at a time (sequentially)
- **VM Context Isolation**: Each workflow execution gets its own isolated Node.js VM context
- **Stateless Containers**: Container instances are stateless and can be reused for multiple workflows
- **Scaling**: More concurrent workflows = more container instances (configured via `max_instances`)

### Build Process
- **Local Build**: Application is built locally with all dependencies bundled
- **Minimal Container**: Only the built bundle and necessary runtime files are copied to containers
- **No node_modules**: Dependencies are bundled into the build output, not copied separately

## Local Development

### Workflow Development

1. **Start Local Dev Server**
```bash
pnpm dev
```

2. **Make Changes to Workflows**
   - Edit workflow files in the `workflows/` directory
   - The dev server automatically rebuilds and updates
   - Test workflows through the local server

3. **Test Workflow Execution**
   - Workflows execute in the local development environment
   - Step functions run with full Node.js access
   - Use browser dev tools to inspect execution

### Container Testing Locally

For testing container execution locally (optional):

1. **Build the Application**
```bash
pnpm build
```

2. **Test Container Locally** (if you have Docker installed)
```bash
# Build the Docker image
docker build -t workflow-test .

# Run the container
docker run -p 8080:8080 workflow-test
```

**Note**: Local container testing is optional and not required for development.

## Production Deployment

### Prerequisites

- **Docker**: Installed and running (for building containers)
- **Cloudflare Account**: With Workers, D1, Queues, R2, and Containers enabled
- **CLI Tools**: `wrangler` and `workflow-cloudflare-world`

### Deployment Steps

1. **Generate Configuration**
```bash
npx workflow-cloudflare-world
```

The CLI generates:
- `wrangler.json` with container configuration
- `Dockerfile` optimized for Cloudflare Containers
- `.dockerignore` to minimize build context
- Queue handler template (`src/worker.ts`)
- D1 migration file (`migrations/0000_workflow_cloudflare.sql`)

2. **Build Application**
```bash
pnpm build
```

3. **Deploy to Cloudflare**
```bash
# Create D1 database (first time only)
wrangler d1 create workflow-db

# Apply migrations
wrangler d1 migrations apply workflow-db

# Deploy Worker and Containers (takes 2-3 minutes)
wrangler deploy

# Check container status
wrangler containers list
```

### What Gets Deployed

- **Worker**: HTTP handler, queue consumer, and orchestration logic
- **Containers**: Node.js VM execution environment for workflows
- **Durable Objects**: StreamCoordinator and WorkflowExecutorContainer
- **Storage**: D1 database, R2 bucket, Cloudflare Queues

## Container Configuration

### Generated Dockerfile

The CLI creates a minimal Dockerfile optimized for Cloudflare:

```dockerfile
# Use Node.js 18 Alpine as base image for Cloudflare Containers
FROM node:18-alpine AS runner

WORKDIR /app
ENV NODE_ENV production

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

# Copy ONLY the runtime bundle - no node_modules needed!
COPY dist ./dist

# Set permissions
RUN chown -R nodejs:nodejs /app

EXPOSE 8080
USER nodejs
CMD ["node", "dist/index.js"]
```

### For SvelteKit Applications

The CLI automatically adjusts paths for SvelteKit:

```dockerfile
# Copy SvelteKit build outputs
COPY .svelte-kit/output/server ./server
COPY .svelte-kit/cloudflare/_worker.js ./
CMD ["node", "_worker.js"]
```

### Generated .dockerignore

Optimizes build size and speed by excluding unnecessary files:

```
# Dependencies (huge, not needed in container)
node_modules
.pnpm-store

# Development files
src
.vite
.swc
.wrangler
.wrangler-logs

# Config files
tsconfig.json
svelte.config.js
vite.config.ts
*.config.*

# Build outputs we don't need (keep SvelteKit output)
build
dist

# Keep SvelteKit build outputs needed for container
# .svelte-kit/cloudflare/_worker.js
# .svelte-kit/output/server/
```

## Container Scaling and Performance

### Instance Types

Choose based on workflow complexity:

- **lite** (1/16 vCPU, 256 MiB, 2 GB) - Simple workflows
- **basic** (1/4 vCPU, 1 GiB, 4 GB) - Most workflows (default)
- **standard-1** (1/2 vCPU, 4 GiB, 8 GB) - Complex workflows
- **standard-2** (1 vCPU, 6 GiB, 12 GB) - Heavy workflows
- **standard-3** (2 vCPU, 8 GiB, 16 GB) - Very heavy workflows
- **standard-4** (4 vCPU, 12 GiB, 20 GB) - Maximum workflows

### Scaling Behavior

- **Concurrent Workflows**: `max_instances` (default: 10)
- **Cold Starts**: 2-3 seconds for first container start
- **Warm Execution**: ~0ms for subsequent requests in same container
- **Warming Period**: 10 minutes of inactivity before container sleeps
- **Queue Processing**: Workflows queue when all containers are busy

### Performance Monitoring

```bash
# Check container status
wrangler containers list

# Monitor queue processing
wrangler queues list

# View logs
wrangler tail

# Check specific container details
wrangler containers get <container-id>
```

## Troubleshooting

### Common Issues

#### Build Issues

**Problem**: `Docker build failed` with file not found errors
**Solution**: Ensure `.svelte-kit` is not excluded by `.dockerignore`

**Problem**: Large build context (>100MB)
**Solution**: Check `.dockerignore` excludes `node_modules` and other large directories

#### Deployment Issues

**Problem**: "Queue already has a consumer" error
**Solution**: Delete and recreate queues, or update existing configuration

**Problem**: Container instances showing as unhealthy
**Solution**: Check container logs for errors, verify build output integrity

#### Runtime Issues

**Problem**: Workflows not executing in containers
**Solution**:
- Verify queue configuration points to containers
- Check `WorkflowExecutorContainer` is properly exported
- Monitor queue message processing

**Problem**: Local development works but production doesn't
**Solution**:
- Verify build process completes successfully
- Check container build logs for errors
- Ensure all required files are copied to container

### Debugging Container Issues

1. **Check Container Status**
```bash
wrangler containers list
```

2. **View Container Logs**
```bash
wrangler tail --format json
```

3. **Test Individual Components**
```bash
# Test queue processing
wrangler queues producer send workflow-queue '{"test": "message"}'

# Test Worker directly
curl https://your-worker.workers.dev/.well-known/workflow/v1/flow
```

## Best Practices

### Development Workflow

1. **Local Development First**: Always develop and test workflows locally
2. **Incremental Builds**: Build and test frequently during development
3. **Monitor Resources**: Keep an eye on container utilization and queue depths
4. **Error Handling**: Implement proper error handling in workflow code

### Production Deployment

1. **Staging Environment**: Test in a staging environment before production
2. **Gradual Rollouts**: Use Cloudflare's rollout strategies for updates
3. **Monitoring**: Set up monitoring for container health and queue performance
4. **Backup Strategy**: Regular backups of D1 databases

### Performance Optimization

1. **Choose Right Instance Type**: Match container size to workflow complexity
2. **Optimize Build Size**: Minimize bundle size for faster container starts
3. **Monitor Queues**: Keep queue depths low to prevent delays
4. **Tune Warming Period**: Adjust based on usage patterns

## Integration Examples

### Different Frameworks

**Next.js**:
```dockerfile
COPY .next/standalone ./
COPY .next/static ./.next/static
```

**Remix**:
```dockerfile
COPY build ./build
COPY public ./public
```

**Express**:
```dockerfile
COPY dist ./dist
```

### Custom Builds

For custom build systems, adjust the Dockerfile paths:

```dockerfile
# Replace these paths with your build output locations
COPY your-build-output ./app
CMD ["node", "app/index.js"]
```

## Security Considerations

### Container Security

- **Non-root User**: Containers run as non-root `nodejs` user
- **Minimal Base Image**: Uses Alpine Linux for minimal attack surface
- **No Secrets**: Never copy secrets or sensitive data into containers

### Runtime Security

- **VM Isolation**: Each workflow runs in isolated VM context
- **Deterministic Execution**: No access to external time/random sources
- **Network Control**: Containers can only access approved external services

## Local Development FAQ

### Q: Can I test containers locally?
**A**: Yes, but it's optional. Most development can be done with `pnpm dev`.

### Q: Do I need Docker installed?
**A**: Only for building and testing containers locally. Production deployment uses Cloudflare's container service.

### Q: How do I debug workflow execution in containers?
**A**: Check queue processing logs and container status via `wrangler` commands.

### Q: Can I run different container instance types locally?
**A**: Local Docker testing uses your local Docker environment, not Cloudflare's specific instance types.

### Q: What if my build output is in a different directory?
**A**: Update the `COPY` paths in the generated Dockerfile to match your build output structure.

## Support

- **Documentation**: See [HOW_IT_WORKS.md](./HOW_IT_WORKS.md) for detailed architecture
- **Issues**: Report bugs in the GitHub repository
- **Community**: Join discussions in the Workflow DevKit community