# workflow-node

Adapter utilities that wire Workflow DevKit into any Node.js server. Build the `.well-known/workflow/v1` handlers once, mount the HTTP routes, and fetch workflow functions with metadata via the generated `client.js`.

```bash
npm add workflow workflow-node
```

## Quick Start

1. **Author a workflow**

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

2. **Build the handlers**

```bash
workflow build
```

The CLI (or `createWorkflowNodeBuilder`) emits:

- `./.well-known/workflow/v1/flow.js`
- `./.well-known/workflow/v1/step.js`
- `./.well-known/workflow/v1/webhook.js`
- `./.well-known/workflow/v1/client.js`

3. **Wire up your server**

```ts
// server.ts
import http from 'node:http';
import { createWorkflowNodeFetchHandler, getWorkflow } from 'workflow-node';
import { start } from 'workflow/api';

const workflowHandler = await createWorkflowNodeFetchHandler();
const handleGreeting = await getWorkflow('handleGreeting');

const server = http.createServer(async (req, res) => {
  if (await workflowHandler(req, res)) {
    return;
  }

  if (req.method === 'POST' && req.url === '/trigger') {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    const name =
      typeof payload?.name === 'string' ? payload.name : 'workflow-user';
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
```

The fetch handler automatically serves:

- `POST /.well-known/workflow/v1/flow`
- `POST /.well-known/workflow/v1/step`
- `/.well-known/workflow/v1/webhook/:token` (all HTTP verbs)

## Runtime Helpers

- `createWorkflowNodeFetchHandler({ buildDir, logger })`  
  Converts `IncomingMessage` / `ServerResponse` into Web standard `Request` / `Response` objects and routes the workflow endpoints. Returns `true` when the request was handled so you can fall back to your own router.

- `createWorkflowNodeServer({ buildDir, port, hostname, logger, customHandler })`  
  Convenience helper that spins up an `http.createServer()` with the workflow handler pre-wired. Use `customHandler` to attach additional routes.

- `getWorkflow(name, { buildDir })`  
  Dynamically imports the generated `client.js` bundle and returns the workflow function with its `workflowId`. Pairs with `start()` without needing to manually annotate functions.

## Build-Time Helpers

- `createWorkflowNodeBuilder(options)`  
  Programmatic builder that mirrors `workflow build`. Configure directories, watch mode, custom output paths, manifests, and target (`local` vs. Vercel Build Output API). Automatically generates the client bundle so `getWorkflow()` works everywhere.

- `annotateWorkflowsFromManifest({ manifestPath, manifest, workingDir, logger })`  
  Optional escape hatch when you prefer manifests over the generated client bundle (e.g., bundlers that cannot import `.well-known/workflow/v1/client.js` at runtime).

Docs: https://useworkflow.dev/docs/how-it-works/framework-integrations
