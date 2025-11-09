# workflow-cloudflare-world

A workflow system backed by Cloudflare primitives (D1, Queues, R2) for edge-deployed workflows. This implementation leverages Cloudflare Workers' distributed infrastructure for durable workflow execution.

## Installation

```bash
npm install workflow-cloudflare-world
# or
pnpm add workflow-cloudflare-world
# or
yarn add workflow-cloudflare-world
```

## Usage

### Basic Setup

The Cloudflare world can be configured by setting the `WORKFLOW_TARGET_WORLD` environment variable:

```bash
export WORKFLOW_TARGET_WORLD="workflow-cloudflare-world"
```

> This package is self-hosted. Setting the environment variable just tells the Workflow SDK to instantiate this world inside your Worker—you still deploy and operate the Worker, queues, D1, R2, and Durable Objects yourself.

### CLI Helper

Run the included CLI to scaffold the Cloudflare bindings and queue handler directly in your project:

```bash
npx workflow-cloudflare-world
```

It asks how you want to deploy, which built bundle file Wrangler should use as `main`, and where your D1 migrations should live. The CLI then:

- Writes a `wrangler.json` stub (or prints JSON to merge)
- Creates a queue/`StreamCoordinator` entry file (default `src/worker.ts`)
- Drops the baseline D1 migration (`0000_workflow_cloudflare.sql`) into your chosen migrations directory

Adjust the file paths or merge the output into your existing config if needed.

### Deployment Models

You can run the world in two ways:

1. **Co-located with your app** – Install `workflow-cloudflare-world` in the same Worker that serves your SvelteKit/Next/Nitro routes. The generated `/.well-known/workflow` handlers, queue consumer, and world storage all share one deployment and one set of bindings.
2. **Dedicated Worker** – Deploy a standalone Worker that only exposes the world (including the queue consumer and `StreamCoordinator`). Application Workers connect to it via a [service binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/) (`WORKFLOW_DISPATCH`) or, less preferably, an HTTPS origin (`WORKFLOW_DISPATCH_URL`). Multiple apps can share the same world Worker this way.

In both scenarios, Cloudflare Queues deliver messages to your Worker, `handleQueueMessage` forwards them to the workflow/step HTTP handlers, and the Durable Object keeps streaming state consistent during deployments.

### Wrangler Configuration

Configure your Cloudflare Worker with the required bindings in `wrangler.json`:

```json
{
  "name": "my-workflow-worker",
  "main": "dist/index.js",
  "compatibility_date": "2024-09-26",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "workflow-db"
    }
  ],
  "migrations_dir": "migrations",
  "durable_objects": {
    "bindings": [
      {
        "name": "STREAM_COORDINATOR",
        "class_name": "StreamCoordinator"
      }
    ]
  },
  "migrations": [
    {
      "tag": "stream-coordinator-v1",
      "new_classes": ["StreamCoordinator"]
    }
  ],
  "queues": {
    "producers": [
      {
        "binding": "WORKFLOW_QUEUE",
        "queue": "workflow-queue"
      },
      {
        "binding": "STEP_QUEUE",
        "queue": "step-queue"
      }
    ],
    "consumers": [
      {
        "queue": "workflow-queue",
        "max_batch_size": 10,
        "max_batch_timeout": 5
      },
      {
        "queue": "step-queue",
        "max_batch_size": 10,
        "max_batch_timeout": 5
      }
    ]
  },
  "r2_buckets": [
    {
      "binding": "STREAM_BUCKET",
      "bucket_name": "workflow-streams"
    }
  ],
  "vars": {
    "DEPLOYMENT_ID": "production"
  }
}
```

### Programmatic Usage

Create a Cloudflare world in your Worker:

```typescript
import {
  createWorld,
  handleQueueMessage,
  type CloudflareEnv,
  type MessageBatch,
} from "workflow-cloudflare-world";

export default {
  async fetch(request: Request, env: CloudflareEnv): Promise<Response> {
    const world = createWorld(env);
    
    // Use world for workflow operations
    const run = await world.runs.create({
      workflowName: "my-workflow",
      input: ["arg1", "arg2"],
      deploymentId: env.DEPLOYMENT_ID || "default",
    });
    
    return Response.json({ runId: run.runId });
  },

  async queue(batch: MessageBatch, env: CloudflareEnv): Promise<void> {
    for (const message of batch.messages) {
      try {
        const result = await handleQueueMessage(env, message);
        if (result?.retryAfterSeconds) {
          message.retry({ delaySeconds: result.retryAfterSeconds });
        } else {
          message.ack();
        }
      } catch (error) {
        console.error("Failed to forward queue message", error);
        message.retry();
      }
    }
  },
};
```

### Durable Object Registration

Add the coordinator class to your Worker module so Wrangler can bind it:

```typescript
import { StreamCoordinator } from "workflow-cloudflare-world";

export { StreamCoordinator };
```

## Required Bindings

The Cloudflare world requires the following environment bindings:

| Binding             | Type                     | Description                                    |
| ------------------- | ------------------------ | ---------------------------------------------- |
| `DB`                | `D1Database`             | D1 database for workflow state storage         |
| `WORKFLOW_QUEUE`    | `Queue`                  | Cloudflare Queue for workflow tasks            |
| `STEP_QUEUE`        | `Queue`                  | Cloudflare Queue for step tasks                |
| `STREAM_BUCKET`     | `R2Bucket`               | R2 bucket for stream chunk storage             |
| `STREAM_COORDINATOR`| `DurableObjectNamespace` | Durable Object coordinating stream writers/readers |
| `WORKFLOW_DISPATCH` | `Service binding` (optional) | Internal binding that can invoke your Worker routes without leaving Cloudflare's network |
| `WORKFLOW_DISPATCH_URL` | `string` (optional)  | Public origin (for example `https://example.workers.dev`) used when no service binding is available |
| `DEPLOYMENT_ID`     | `string` (optional)      | Deployment identifier (default: "cloudflare")  |

> Configure either `WORKFLOW_DISPATCH` or `WORKFLOW_DISPATCH_URL` so queue consumers can reach your `.well-known/workflow` endpoints.

## Database Setup

This package uses Cloudflare D1 with Drizzle ORM. The CLI copies the baseline schema migration into your chosen directory (default `migrations/0000_workflow_cloudflare.sql`). Apply it before deploying:

```bash
# Create D1 database
wrangler d1 create workflow-db

# Apply migrations to D1 (local or remote)
wrangler d1 migrations apply workflow-db
```

Add future schema changes by editing the Drizzle schema in this package, generating a new SQL file, and dropping it into the same migrations folder before re-running the `wrangler d1 migrations apply` command.
## Features

- **Durable Storage**: D1 (SQLite) stores workflow runs, events, steps, and hooks
- **Queue Processing**: Native Cloudflare Queues deliver workflow + step jobs with retry semantics compatible with other worlds
- **Streaming**: Durable Object + R2 combo provides push-based `ReadableStream` delivery without polling
- **Edge Deployment**: Runs entirely inside Cloudflare Workers (or a Worker + DO pair) with zero extra infrastructure
- **Self-hosted Flexibility**: Bundle with your app or expose a shared world Worker via service bindings

## Development

For local development with Wrangler:

```bash
# Start local development server
wrangler dev

# Tail logs
wrangler tail

# Deploy to Cloudflare
wrangler deploy
```

### Local D1 Development

```bash
# Use local D1 database
wrangler dev --local

# View D1 data
wrangler d1 execute workflow-db --local --command "SELECT * FROM workflow_runs"
```

## Queue Consumer Setup

Queue consumers are automatically configured in `wrangler.json`. Implement the `queue()` handler in your Worker:

```typescript
import { handleQueueMessage, type MessageBatch } from 'workflow-cloudflare-world';

export default {
  async queue(batch: MessageBatch, env: CloudflareEnv): Promise<void> {
    for (const message of batch.messages) {
      try {
        const result = await handleQueueMessage(env, message);
        if (result?.retryAfterSeconds) {
          message.retry({ delaySeconds: result.retryAfterSeconds });
        } else {
          message.ack();
        }
      } catch (error) {
        console.error('Failed to dispatch queue message', error);
        message.retry();
      }
    }
  }
};
```

If you run the world as a separate Worker, make sure this consumer lives in that Worker and expose it to application Workers through a service binding (`WORKFLOW_DISPATCH`). If the world is co-located with your app, the same Worker handles both HTTP and queue traffic.

## World Selection

To use the Cloudflare world, set the `WORKFLOW_TARGET_WORLD` environment variable:

```bash
export WORKFLOW_TARGET_WORLD="workflow-cloudflare-world"
```

Or in `wrangler.json`:

```json
{
  "vars": {
    "WORKFLOW_TARGET_WORLD": "workflow-cloudflare-world"
  }
}
```

This setting only points the Workflow SDK at this world implementation—you still need to deploy the Worker (co-located or dedicated) with the bindings described above so queue handlers, storage, and streaming are available.
