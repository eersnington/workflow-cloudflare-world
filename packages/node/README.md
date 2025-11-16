# workflow-node

Helpers for running [Workflow DevKit](https://useworkflow.dev) workflows inside plain Node.js servers. The package bundles three pieces:

- **Builder** – generates the `.well-known/workflow/v1` handlers and workflow manifest with zero config, picking `local` vs `vercel` automatically.
- **Server/fetch helpers** – mount the Workflow HTTP routes inside any Node HTTP framework (native `http`, Fastify, Express, etc.).

## Installation

```bash
npm add workflow-node
```

## Generate workflow bundles

Run the Workflow CLI (`npx workflow build`) or call the builder directly:

```ts
import { createWorkflowNodeBuilder } from 'workflow-node/builder';

const builder = createWorkflowNodeBuilder({
  watch: process.env.NODE_ENV !== 'production',
});

await builder.build();
```

`createWorkflowNodeBuilder` produces a local builder by default and automatically switches to the `vercel` target inside Vercel builds (the same code path the Next/Nuxt/Nitro adapters use).

## Mount inside an existing server

```ts
import http from 'node:http';
import { createWorkflowNodeFetchHandler } from 'workflow-node';
import { start } from 'workflow/api';
import { handleGreeting } from './workflows/handle-greeting.js';

async function main() {
  const workflowHandler = await createWorkflowNodeFetchHandler();

  const server = http.createServer(async (req, res) => {
    // Give Workflow a chance to handle /.well-known/workflow/v1/*
    if (await workflowHandler(req, res)) {
      return;
    }

    if (req.method === 'POST' && req.url === '/test') {
      const run = await start(handleGreeting, ['Ada']);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ runId: run.runId }));
      return;
    }

    res.writeHead(404).end('Not Found');
  });

  server.listen(3152, () => {
    console.log('Server listening on http://127.0.0.1:3152');
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

Prefer a fully managed server? Call `createWorkflowNodeServer()` – it boots a minimal HTTP server that only serves the Workflow routes. Supply `customHandler` when you want to add extra endpoints.

## Optional: annotate workflows from the manifest

If you are not running the SWC client transform, restore workflow IDs at runtime before calling `start()`:

```ts
import { annotateWorkflowsFromManifest } from 'workflow-node/manifest';

await annotateWorkflowsFromManifest({
  manifestPath: '.well-known/workflow/manifest.json',
});
```

This attaches the same metadata that the SWC transform would have injected, so `start()` can resolve your workflow functions deterministically.
