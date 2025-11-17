# workflow-bun

workflow-bun ships the Workflow DevKit runtime glue for Bun: compile workflows into `.well-known/workflow/v1`, restore workflow IDs from the manifest, and mount the Workflow HTTP routes inside `Bun.serve()`.

```bash
bun add workflow workflow-bun
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
  console.log(`[bun] Hello ${name}`);
}
```

```bash
bun x workflow build --workflow-manifest .well-known/workflow/manifest.json
```

Need to script it instead of shelling out to the CLI? Use the builder directly:

```ts
import { createWorkflowBunBuilder } from 'workflow-bun/builder';

await createWorkflowBunBuilder({
  workflowManifestPath: '.well-known/workflow/manifest.json',
  watch: process.env.NODE_ENV !== 'production',
}).build();
```

```ts
import { createWorkflowBunFetchHandler } from 'workflow-bun';
import { annotateWorkflowsFromManifest } from 'workflow-bun/manifest';
import { start } from 'workflow/api';
import { handleGreeting } from './workflows/handle-greeting';

await annotateWorkflowsFromManifest({
  manifestPath: '.well-known/workflow/manifest.json',
});

const appFetch = async (request: Request) => {
  const url = new URL(request.url);

  if (request.method === 'GET' && url.pathname === '/healthz') {
    return new Response('ok');
  }

  if (request.method === 'POST' && url.pathname === '/trigger') {
    const payload = await request.json().catch(() => ({}));
    const name =
      typeof payload?.name === 'string' ? payload.name : 'bun-user';
    const run = await start(handleGreeting, [name]);
    return Response.json({ runId: run.runId });
  }

  return new Response('Not Found', { status: 404 });
};

const workflowFetch = await createWorkflowBunFetchHandler({
  fetch: appFetch,
});

Bun.serve({
  port: Number(process.env.PORT ?? 3153),
  fetch: workflowFetch,
});
```

## API reference

### `createWorkflowBunBuilder(options)`
Wraps the generic Workflow builder so it defaults to Bun projects. Accepts `watch`, `dirs`, `workingDir`, `target`, and `workflowManifestPath`. When `target` resolves to `'local'`, it writes `.well-known/workflow/v1/{flow,step,webhook}.mjs` plus the manifest (if `workflowManifestPath` is provided). When Vercel env vars are present it automatically switches to the Vercel Build Output API target.

### `createWorkflowBunFetchHandler({ buildDir, fetch, logger })`
Loads the generated handlers from `buildDir` (defaults to `./.well-known/workflow/v1`) and returns an async Bun `fetch()` compatible function. It handles the Workflow routes first; when a request doesn’t match `/.well-known/workflow/v1/*`, it calls the optional `fetch` fallback so you can keep routing through Hono, Elysia, or any custom logic.

### `createWorkflowBunServer(options)`
Boots a dedicated `Bun.serve()` instance that only responds to Workflow routes unless you inject `options.fetch`. It accepts the same `buildDir`, `port`, `hostname`, and `development` flags you would normally pass to `Bun.serve()`, plus an optional `logger`.

### `annotateWorkflowsFromManifest({ manifestPath, manifest, workingDir, logger })`
Loads the manifest generated during `workflow build` (JSON shape of `{ "<relative file>": { "<export name>": { workflowId } } }`) and re-attaches each `workflowId` onto the exported workflow function. This mirrors what the SWC transform would have injected during compilation; call it once during startup if you aren’t running that transform.

Docs: https://useworkflow.dev/docs/how-it-works/framework-integrations
