# Workflow DevKit + SvelteKit on Cloudflare

This example bundles the `workflow-cloudflare-world` package directly into a SvelteKit Worker so every workflow runs on Cloudflare’s D1/Queues/R2 stack without relying on an external service.

## Prerequisites

1. **Install dependencies**
   ```bash
   pnpm install
   ```
2. **Set the world target** – point the Workflow SDK at the bundled world:
   ```bash
   export WORKFLOW_TARGET_WORLD="workflow-cloudflare-world"
   ```
3. **Provision Cloudflare resources** – you need:
   - A D1 database bound as `DB`
   - Two Queues (`WORKFLOW_QUEUE`, `STEP_QUEUE`)
   - An R2 bucket bound as `STREAM_BUCKET`
   - A Durable Object namespace + migration for `StreamCoordinator`
   - Optional `WORKFLOW_DISPATCH` service binding (recommended) or `WORKFLOW_DISPATCH_URL`
   > Tip: run `npx workflow-cloudflare-world` from the repo root; it will write a `wrangler.generated.json` you can merge into this project and shows the exact code to export `StreamCoordinator` + queue handlers.

## Wiring the Worker

1. **Wrangler configuration**
   ```jsonc
   {
     "name": "sveltekit-workflow",
     "main": "build/index.js",
     "compatibility_date": "2024-09-26",
     "d1_databases": [{ "binding": "DB", "database_name": "workflow-db" }],
     "durable_objects": {
       "bindings": [{ "name": "STREAM_COORDINATOR", "class_name": "StreamCoordinator" }]
     },
     "migrations": [{ "tag": "stream-coordinator-v1", "new_classes": ["StreamCoordinator"] }],
     "queues": {
       "producers": [
         { "binding": "WORKFLOW_QUEUE", "queue": "workflow-queue" },
         { "binding": "STEP_QUEUE", "queue": "step-queue" }
       ],
       "consumers": [
         { "queue": "workflow-queue", "max_batch_size": 10, "max_batch_timeout": 5 },
         { "queue": "step-queue", "max_batch_size": 10, "max_batch_timeout": 5 }
       ]
     },
     "r2_buckets": [{ "binding": "STREAM_BUCKET", "bucket_name": "workflow-streams" }]
   }
   ```

2. **Export the Durable Object**
   ```ts
   import { StreamCoordinator } from "workflow-cloudflare-world";
   export { StreamCoordinator };
   ```

3. **Queue consumer**
   ```ts
   import type { CloudflareEnv, handleQueueMessage } from "workflow-cloudflare-world";

   export default {
     async queue(batch: MessageBatch, env: CloudflareEnv) {
       for (const message of batch.messages) {
         const result = await handleQueueMessage(env, message);
         result?.retryAfterSeconds
           ? message.retry({ delaySeconds: result.retryAfterSeconds })
           : message.ack();
       }
     }
   };
   ```

The generated SvelteKit routes at `/.well-known/workflow/v1/*` already exist in this workbench project; bundling `workflow-cloudflare-world` ensures they can create runs, enqueue work, and stream logs entirely within Cloudflare.

## Local Development

```bash
# Run type checks + build workflow bundles
pnpm run check

# Start the dev server with Wrangler (Queues + D1)
pnpm wrangler dev --local
```

## Deployment

```bash
pnpm run build          # Build the SvelteKit app + workflow bundles
pnpm wrangler deploy    # Deploy Worker, queues, D1 migrations, and StreamCoordinator
```

After deployment, hitting the app routes and calling `start(workflowFn)` will enqueue work onto Cloudflare Queues. The queue consumer in the same Worker forwards messages to the generated workflow/step handlers, which hydrate state from D1 and stream output through the Durable Object + R2 combination. No external workflow service is required.***
