# @workflow/world-cloudflare

A workflow system backed by Cloudflare primitives (D1, Queues, R2) for edge-deployed workflows. This implementation leverages Cloudflare Workers' distributed infrastructure for durable workflow execution.

## Installation

```bash
npm install @workflow/world-cloudflare
# or
pnpm add @workflow/world-cloudflare
# or
yarn add @workflow/world-cloudflare
```

## Usage

### Basic Setup

The Cloudflare world can be configured by setting the `WORKFLOW_TARGET_WORLD` environment variable:

```bash
export WORKFLOW_TARGET_WORLD="@workflow/world-cloudflare"
```

### Wrangler Configuration

Configure your Cloudflare Worker with the required bindings in `wrangler.json`:

```json
{
  "name": "my-workflow-worker",
  "main": "src/index.ts",
  "compatibility_date": "2024-09-26",
  "compatibility_flags": ["nodejs_compat"],
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "workflow-db",
      "database_id": "YOUR_D1_DATABASE_ID",
      "migrations_dir": "src/drizzle/migrations"
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
import { createWorld } from "@workflow/world-cloudflare";
import type { CloudflareEnv } from "@workflow/world-cloudflare";
import { handleQueueMessage } from '@workflow/world-cloudflare';

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
      await handleQueueMessage(env, message);
    }
  }
};
```

## Required Bindings

The Cloudflare world requires the following environment bindings:

| Binding           | Type                     | Description                                    |
| ----------------- | ------------------------ | ---------------------------------------------- |
| `DB`              | `D1Database`             | D1 database for workflow state storage         |
| `WORKFLOW_QUEUE`  | `Queue`                  | Cloudflare Queue for workflow tasks            |
| `STEP_QUEUE`      | `Queue`                  | Cloudflare Queue for step tasks                |
| `STREAM_BUCKET`   | `R2Bucket`               | R2 bucket for stream chunk storage             |
| `DEPLOYMENT_ID`   | `string` (optional)      | Deployment identifier (default: "cloudflare")  |

## Database Setup

This package uses Cloudflare D1 with Drizzle ORM:

```bash
# Create D1 database
wrangler d1 create workflow-db

# Generate migrations from schema
pnpm drizzle-kit generate

# Apply migrations to D1
wrangler d1 migrations apply workflow-db --local  # for local dev
wrangler d1 migrations apply workflow-db          # for production
```

## Features

- **Durable Storage**: D1 (SQLite) stores workflow runs, events, steps, and hooks
- **Queue Processing**: Native Cloudflare Queues for reliable job processing
- **Streaming**: R2-based chunk storage for workflow streams
- **Edge Deployment**: Runs on Cloudflare's global network
- **Automatic Scaling**: Leverages Cloudflare Workers' auto-scaling

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
import { handleQueueMessage } from '@workflow/world-cloudflare';

export default {
  async queue(batch: MessageBatch, env: CloudflareEnv): Promise<void> {
    
    for (const message of batch.messages) {
      await handleQueueMessage(message);
      message.ack(); // Acknowledge successful processing
    }
  }
};
```

## World Selection

To use the Cloudflare world, set the `WORKFLOW_TARGET_WORLD` environment variable:

```bash
export WORKFLOW_TARGET_WORLD="@workflow/world-cloudflare"
```

Or in `wrangler.json`:

```json
{
  "vars": {
    "WORKFLOW_TARGET_WORLD": "@workflow/world-cloudflare"
  }
}