<div align="center">
  <a href="https://useworkflow.dev">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://useworkflow.dev/workflow-circle-symbol-dark.svg">
      <img alt="Workflow DevKit logo" src="https://useworkflow.dev/workflow-circle-symbol-light.svg" height="128">
    </picture>
  </a>
  <h1>Workflow Cloudflare World</h1>

<a href="https://vercel.com"><img alt="Vercel logo" src="https://img.shields.io/badge/MADE%20BY%20Vercel-000000.svg?style=for-the-badge&logo=Vercel&labelColor=000"></a>
<a href="https://www.npmjs.com/package/workflow-cloudflare-world"><img alt="NPM version" src="https://img.shields.io/npm/v/workflow-cloudflare-world?style=for-the-badge&labelColor=000000"></a>
<a href="https://github.com/vercel/workflow/blob/main/LICENSE.md"><img alt="License" src="https://img.shields.io/npm/l/workflow.svg?style=for-the-badge&labelColor=000000"></a>
<a href="https://github.com/vercel/workflow/discussions"><img alt="Join the community on GitHub" src="https://img.shields.io/badge/Join%20the%20community-blueviolet.svg?style=for-the-badge&logo=Github&labelColor=000000&logoWidth=20"></a>

</div>

This repo hosts the Cloudflare-specific world implementation plus a SvelteKit workbench. If you’re looking for the full Workflow DevKit docs, head to [useworkflow.dev](https://useworkflow.dev).

### World Implementation for Cloudflare

This repository ships the **Cloudflare World** implementation (`workflow-cloudflare-world`) alongside an end-to-end SvelteKit workbench (`workbench/sveltekit-cf`). Together they demonstrate how to run Workflow entirely on Cloudflare primitives—D1, Queues, R2, and Durable Objects—without relying on an external Workflow service.

#### Repository Layout

- `packages/world-cloudflare/` – Production-ready world implementation consumed by applications. Exposes `createWorld`, `handleQueueMessage`, `StreamCoordinator`, and a CLI to scaffold Wrangler/D1 assets.
- `workbench/sveltekit-cf/` – Reference app showing how to:
  - Patch adapter-cloudflare’s generated `_worker.js` so Wrangler sees both the HTTP `fetch` handler and the Workflow queue/Durable Object exports.
  - Wire SvelteKit routes at `/.well-known/workflow/v1/*` and the queue consumer into a single Worker.
  - Deploy via Wrangler using the bindings produced by the CLI.
- `PROBLEMS.md` – Living doc of Cloudflare-specific pitfalls (entrypoint patching, queue wiring, runtime polyfills, serializer limits, etc.) encountered while making this world run on Workers.

#### Installing the Cloudflare World

```bash
pnpm add workflow-cloudflare-world
# or npm/yarn equivalents
export WORKFLOW_TARGET_WORLD="workflow-cloudflare-world"
```

> `WORKFLOW_TARGET_WORLD` tells the Workflow SDK to instantiate this world in-process. You still deploy and operate the Worker, D1 database, queues, R2 bucket, and Durable Object yourself.

#### CLI Scaffolding

Run the built-in CLI from your app directory:

```bash
npx workflow-cloudflare-world
```

It will:

1. Ask how you deploy (co-located vs. dedicated Worker) and which built file Wrangler should treat as `main`.
2. Generate a `wrangler.json` stub with the required bindings (`DB`, `WORKFLOW_QUEUE`, `STEP_QUEUE`, `STREAM_BUCKET`, `STREAM_COORDINATOR`, assets, `nodejs_compat`, etc.).
3. Scaffold `src/worker.ts` exporting `StreamCoordinator` plus the queue consumer (`handleQueueMessage` loop).
4. Drop the baseline D1 migration (`migrations/0000_workflow_cloudflare.sql`).
5. Remind you to point Wrangler at the patched adapter output (`.svelte-kit/cloudflare/_worker.js`) so both fetch + queue exports ship together.

#### Required Wrangler Bindings

```jsonc
{
  "name": "workflow-app",
  "main": ".svelte-kit/cloudflare/_worker.js",
  "compatibility_date": "2024-09-26",
  "compatibility_flags": ["nodejs_compat"],
  "d1_databases": [{ "binding": "DB", "database_name": "workflow-db", "migrations_dir": "migrations" }],
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
  "r2_buckets": [{ "binding": "STREAM_BUCKET", "bucket_name": "workflow-streams" }],
  "assets": { "binding": "ASSETS", "directory": ".cloudflare/assets" },
  "vars": {
    "DEPLOYMENT_ID": "cloudflare",
    "WORKFLOW_TARGET_WORLD": "workflow-cloudflare-world"
  }
}
```

Add either a service binding (`WORKFLOW_DISPATCH`) or a public URL (`WORKFLOW_DISPATCH_URL`) so queue consumers can call your `.well-known/workflow` routes.

#### Using the World in a Worker

```ts
import {
  createWorld,
  handleQueueMessage,
  StreamCoordinator,
  type CloudflareEnv,
  type MessageBatch,
} from 'workflow-cloudflare-world';

export { StreamCoordinator };

export default {
  async fetch(request: Request, env: CloudflareEnv) {
    const world = createWorld(env);
    const run = await world.runs.create({
      workflowName: 'example',
      input: ['foo'],
      deploymentId: env.DEPLOYMENT_ID ?? 'cloudflare',
    });
    return Response.json(run);
  },
};

export async function queue(batch: MessageBatch, env: CloudflareEnv) {
  for (const message of batch.messages) {
    const result = await handleQueueMessage(env, message);
    result?.retryAfterSeconds
      ? message.retry({ delaySeconds: result.retryAfterSeconds })
      : message.ack();
  }
}
```

#### Workbench & Known Issues

- `workbench/sveltekit-cf` patches adapter-cloudflare’s `_worker.js` via `scripts/patch-worker.mjs` to merge the HTTP and queue exports. Run `pnpm build` before any Wrangler command.
- Review `PROBLEMS.md` for the Cloudflare-specific caveats (entrypoint patching, queue provisioning, WeakRef/FinalizationRegistry polyfills, `nodejs_compat` requirement, serializer `eval` limitation, etc.).

## Troubleshooting & Limitations

- Check `PROBLEMS.md` for the current list of Cloudflare-specific issues (patched `_worker.js`, queue provisioning gotchas, polyfills, serializer `eval` restriction, etc.).
- Cloudflare Workers block `eval`/`new Function`, so `dehydrateWorkflowArguments` cannot serialize certain complex types yet. Stick to JSON-safe primitives until the core runtime ships an eval-free serializer.
- Always run `pnpm build` before `wrangler deploy` so `.svelte-kit/cloudflare/_worker.js` gets patched with the queue/DO exports.

## Support

- Questions / discussions: [GitHub Discussions](https://github.com/vercel/workflow/discussions)
- Bugs specific to this world implementation: open an issue in this repo with details about your Worker setup, Wrangler config, and any relevant logs.
