# workflow-cloudflare

Community Cloudflare Workers helpers for Workflow DevKit. This package mirrors the Node/Bun adapters so you can drop Workflow routes into any Worker or Pages Function.

## Installation

```bash
pnpm add workflow-cloudflare
```

## Generate `.well-known` handlers

Use the Workflow CLI or drive the builder directly:

```ts
import { createWorkflowCloudflareBuilder } from 'workflow-cloudflare/builder';

const builder = createWorkflowCloudflareBuilder();
await builder.build();
```

This writes `flow.mjs`, `step.mjs`, and `webhook.mjs` into `.well-known/workflow/v1`, plus the workflow manifest if enabled.

## Mount inside a Worker

```ts
import * as flowModule from './.well-known/workflow/v1/flow.mjs';
import * as stepModule from './.well-known/workflow/v1/step.mjs';
import * as webhookModule from './.well-known/workflow/v1/webhook.mjs';
import { createWorkflowCloudflareFetchHandler } from 'workflow-cloudflare/server';
import { start } from 'workflow/api';
import { handleGreeting } from './workflows/handle-greeting';

const workflowHandler = await createWorkflowCloudflareFetchHandler({
  modules: {
    flow: flowModule,
    step: stepModule,
    webhook: webhookModule,
  },
});

export default {
  async fetch(request, env, ctx) {
    const workflowResponse = await workflowHandler(request, env, ctx);
    if (workflowResponse) {
      return workflowResponse;
    }

    if (request.method === 'POST' && new URL(request.url).pathname === '/test') {
      const run = await start(handleGreeting, ['Ada']);
      return Response.json({ runId: run.runId });
    }

    return new Response('Not Found', { status: 404 });
  },
};

> ℹ️ Generate the `.well-known` files (via `workflow build` or the builder API) before running `wrangler dev`/`wrangler deploy` so that the imports resolve.
```

Prefer a fully managed Worker wrapper? Use `createWorkflowCloudflareWorker` and pass your fallback fetch handler.

## Optional: annotate with the manifest

When you skip the SWC client transform, restore workflow IDs at runtime:

```ts
import { annotateWorkflowsFromManifest } from 'workflow-cloudflare/manifest';

await annotateWorkflowsFromManifest({
  manifestPath: '.well-known/workflow/manifest.json',
});
```

This attaches the metadata that `start()` expects so you can run workflows without the transform step.
