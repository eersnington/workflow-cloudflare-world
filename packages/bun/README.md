# workflow-bun

Workflow DevKit helpers tailored for Bun runtime + Bun.serve(). The package mirrors the Node version but uses Bun’s native APIs wherever possible:

- **Builder** – generates `.well-known/workflow/v1` bundles and the workflow manifest, auto-selecting `local` vs `vercel`.
- **Fetch helper** – drop-in handler for `Bun.serve()` so you don’t have to manually import the generated files.

## Installation

```bash
bun add workflow-bun
```

## Generate workflow bundles

Run `bun x workflow build` or invoke the builder directly:

```ts
import { createWorkflowBunBuilder } from 'workflow-bun/builder';

const builder = createWorkflowBunBuilder({
  watch: process.env.NODE_ENV !== 'production',
});

await builder.build();
```

The builder writes the handlers into `.well-known/workflow/v1` locally and switches to the Vercel Build Output API target automatically during deployments.

## Mount inside Bun.serve()

```ts
import { createWorkflowBunFetchHandler } from 'workflow-bun';
import { start } from 'workflow/api';
import { handleGreeting } from './workflows/handle-greeting.ts';

const workflowHandler = await createWorkflowBunFetchHandler();

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3153),
  async fetch(req) {
    // Workflow routes first
    const handled = await workflowHandler(req);
    if (handled) {
      return handled;
    }

    if (req.method === 'POST' && new URL(req.url).pathname === '/test') {
      const run = await start(handleGreeting, ['Ada']);
      return Response.json({ runId: run.runId });
    }

    return new Response('Not Found', { status: 404 });
  },
});

console.log(`Workflow Bun example listening on http://localhost:${server.port}`);
```

Prefer routing tables? The fetch handler returns a `Response | undefined`, so you can integrate it inside any router (Elysia, Hono, etc.) by delegating the `/.well-known/workflow/v1/*` routes to it.

## Optional: annotate workflows from the manifest

```ts
import { annotateWorkflowsFromManifest } from 'workflow-bun/manifest';

await annotateWorkflowsFromManifest({
  manifestPath: '.well-known/workflow/manifest.json',
});
```

This mirrors what the SWC client transform would inject, letting you call `start()` with plain workflow functions even without a bundler transform.
