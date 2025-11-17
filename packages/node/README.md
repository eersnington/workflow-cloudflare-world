# workflow-node

workflow-node is the Workflow DevKit adapter for plain Node.js servers. Build `.well-known/workflow/v1`, restore workflow IDs from the manifest, and mount the Workflow HTTP routes inside any framework that speaks the Node `http` interface.

```bash
npm add workflow workflow-node
```

Unless your bundler already runs the Workflow SWC transform, always emit the workflow manifest and call `annotateWorkflowsFromManifest()` before invoking `start()`.

```ts
// workflows/handle-greeting.ts
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

```bash
npx workflow build --workflow-manifest .well-known/workflow/manifest.json
```

Prefer scripting over CLI flags? Instantiate the builder directly:

```ts
import { createWorkflowNodeBuilder } from 'workflow-node/builder';

await createWorkflowNodeBuilder({
  workflowManifestPath: '.well-known/workflow/manifest.json',
  watch: process.env.NODE_ENV !== 'production',
}).build();
```

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
    if (await workflowHandler(req, res)) {
      return;
    }

    if (req.method === 'GET' && req.url === '/healthz') {
      res.writeHead(200).end('ok');
      return;
    }

    if (req.method === 'POST' && req.url === '/trigger') {
      const chunks: Uint8Array[] = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const payload = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      const name =
        typeof payload?.name === 'string' ? payload.name : 'node-user';
      const run = await start(handleGreeting, [name]);
      res
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ runId: run.runId }));
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

## API reference

### `createWorkflowNodeBuilder(options)`
Workflow-aware builder that emits `.well-known/workflow/v1` and, when `workflowManifestPath` is provided, writes the workflow manifest JSON. Accepts `watch`, `dirs`, `workingDir`, `target`, and `externalPackages`. Automatically switches to the Vercel Build Output API target inside Vercel environments.

### `createWorkflowNodeFetchHandler({ buildDir, logger })`
Loads the generated handlers from `buildDir` (defaults to `./.well-known/workflow/v1`) and returns an async function that you can plug into any Node `http` server. It inspects the incoming request, handles Workflow routes, and returns `true` when it writes to the response, letting you fall back to your own routing logic for everything else.

### `createWorkflowNodeServer({ buildDir, port, hostname, logger, customHandler })`
Boots a minimal `http.createServer()` that only serves Workflow routes unless you pass a `customHandler`. The helper logs its URL, exposes `.close()`, and uses the same fetch handler under the hood.

### `annotateWorkflowsFromManifest({ manifestPath, manifest, workingDir, logger })`
Loads the manifest produced during `workflow build` and writes each `workflowId` onto the exported workflow functions. Call it once during startup when you aren’t already running the Workflow SWC transform so `start()` can locate your workflows deterministically.

Docs: https://useworkflow.dev/docs/how-it-works/framework-integrations
