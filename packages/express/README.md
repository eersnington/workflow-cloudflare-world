# workflow-express

workflow-express wires the Workflow DevKit runtime into any Express server: compile workflows into `/.well-known/workflow/v1`, preload the SWC transform for DX, and mount the Workflow HTTP routes without touching your existing handlers.

```bash
npm add workflow workflow-express
```

Enable the Workflow SWC transform once at startup so `start()` can locate your workflows. The helper registers `@swc-node/register` with the Workflow plugin under the hood.

```ts
// server.ts
import 'workflow-express/register';
```

Write your workflows as usual:

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
  console.log(`[express] Hello ${name}`);
}
```

Compile the runtime bundles before booting the server:

```bash
npx workflow build
```

Keep your existing routes (`/health`, `/trigger`) and add the workflow router, which only intercepts `/.well-known/workflow/v1/*`:

```ts
import 'workflow-express/register';
import express from 'express';
import { createWorkflowExpressRouter } from 'workflow-express';
import { start } from 'workflow/api';
import { handleGreeting } from './workflows/handle-greeting';

const app = express();

const workflowRouter = await createWorkflowExpressRouter();
app.use(workflowRouter);

app.use(express.json());

app.get('/health', (_req, res) => res.send('ok'));

app.post('/trigger', async (req, res, next) => {
  try {
    const name =
      typeof req.body?.name === 'string' ? req.body.name : 'express-user';
    const run = await start(handleGreeting, [name]);
    res.json({ runId: run.runId });
  } catch (error) {
    next(error);
}
});

app.listen(Number(process.env.PORT ?? 3154), () => {
  console.log('Workflow Express listening on http://localhost:3154');
});
```

> **Note:** Mount the workflow router before any middleware that consumes the raw request body (e.g. `express.json()`) for `/.well-known/workflow/v1/*` routes so the generated handlers can read the payload.

## API reference

### `createWorkflowExpressRouter({ buildDir, logger })`
Loads the generated handlers from `buildDir` (defaults to `./.well-known/workflow/v1`) and returns an `express.Router` that handles the Workflow routes. When a request doesn’t match those routes, it falls through to the rest of your middleware stack.

### `createWorkflowExpressMiddleware(options)`
Alias for `createWorkflowExpressRouter()`. Provided for parity with other server adapters—`app.use(await createWorkflowExpressMiddleware())` works the same as mounting the router.

### `createWorkflowExpressServer({ buildDir, logger, port, hostname, enhanceApp })`
Boots a dedicated Express application, mounts the Workflow router, and listens on the provided `port`. You can inject extra middleware or routes via `enhanceApp(app)` before the Workflow routes are attached.

### `createWorkflowExpressBuilder({ watch, dirs, workingDir, target, workflowManifestPath })`
Wraps the base Workflow builder with sensible defaults for Express projects. By default it outputs `/.well-known/workflow/v1/{flow,step,webhook}.mjs`, watches your workflow directories during development, and automatically targets the Vercel Build Output API when `VERCEL` env vars are set.

### `annotateWorkflowsFromManifest({ manifestPath, manifest, workingDir, logger })`
Optional fallback for environments that cannot run the SWC transform. Load the manifest generated during `workflow build` and attach the recorded `workflowId`s onto each exported workflow function before calling `start()`.

### `registerWorkflowExpress(options)`
Installs the Workflow SWC transform globally by delegating to `@swc-node/register`. It runs automatically when you `import 'workflow-express/register'`, but you can call it manually to pass custom SWC options or set `skip: true` to opt out (for example, when your bundler already runs the transform).

Official Docs for Custom Integration: https://useworkflow.dev/docs/how-it-works/framework-integrations
