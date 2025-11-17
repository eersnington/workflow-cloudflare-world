# workflow-node

Workflow DevKit helpers for plain Node.js servers: build the `.well-known/workflow/v1` bundle and mount the Workflow HTTP routes in any HTTP framework.

## Installation

```bash
npm add workflow workflow-node
```

Install the core `workflow` package together with `workflow-node` to define workflows, call helpers such as `sleep()`, and run the Workflow CLI.

> **Required:** Unless your app already runs the Workflow SWC transform (which injects workflow IDs automatically), you must emit a workflow manifest during the build and call `annotateWorkflowsFromManifest()` before invoking `start()`. The CLI flag and runtime step below are not optional in that setup.

## Create a workflow

```ts
// ./workflows/handle-greeting.ts
import { sleep } from 'workflow';

export async function handleGreeting(name: string) {
  'use workflow';
  await sayHello(name);
  await sleep('1s');
  await sayHello(`${name}, again`);
}

async function sayHello(name: string) {
  'use step';
  console.log(`[node] Hello ${name}`);
}
```

## Generate workflow bundles

Run the Workflow CLI (`npx workflow build --workflow-manifest .well-known/workflow/manifest.json`) or use the builder API when you need to script it:

```ts
import { createWorkflowNodeBuilder } from 'workflow-node/builder';

await createWorkflowNodeBuilder({
  watch: process.env.NODE_ENV !== 'production',
  workflowManifestPath: '.well-known/workflow/manifest.json',
}).build();
```

The builder emits `.well-known/workflow/v1` locally, writes `.well-known/workflow/manifest.json`, and switches to the Vercel target automatically inside Vercel builds (matching the framework adapters).

## Mount inside an existing server

Run `npx workflow build --workflow-manifest .well-known/workflow/manifest.json` before starting the server so the manifest exists, then wire it up like so:

```ts
import http from 'node:http';
import { createWorkflowNodeFetchHandler } from 'workflow-node';
import { annotateWorkflowsFromManifest } from 'workflow-node/manifest';
import { start } from 'workflow/api';
import { handleGreeting } from './workflows/handle-greeting';

async function main() {
  await annotateWorkflowsFromManifest({
    manifestPath: '.well-known/workflow/manifest.json',
  });

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

`createWorkflowNodeFetchHandler()` only intercepts `/.well-known/workflow/v1/*`, so your custom routes continue to work. Prefer a hosted-only server? `createWorkflowNodeServer()` boots a minimal HTTP server for the Workflow routes; provide `customHandler` to bolt on additional endpoints.

Skip the `annotateWorkflowsFromManifest()` step only when your client build already injects workflow IDs (for example via the Workflow SWC transform).
