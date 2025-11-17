# workflow-bun

Workflow DevKit helpers for Bun’s runtime. Ship the `.well-known/workflow/v1` bundle and mount the HTTP routes without writing any Bun-specific glue.

## Installation

```bash
bun add workflow workflow-bun
```

Install the core `workflow` package alongside `workflow-bun` so you can define workflows (`'use workflow'`), call helpers such as `sleep()`, and run the Workflow CLI.

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
  console.log(`[bun] Hello ${name}`);
}
```

## Generate workflow bundles

Run the Workflow CLI (`bun x workflow build`) or call the builder when you need more control:

```ts
import { createWorkflowBunBuilder } from 'workflow-bun/builder';

await createWorkflowBunBuilder({
  watch: process.env.NODE_ENV !== 'production',
}).build();
```

The builder emits `.well-known/workflow/v1` locally and switches to the Vercel Build Output API target during deployments.

## Mount inside Bun.serve()

```ts
import { createWorkflowBunFetchHandler } from 'workflow-bun';
import { start } from 'workflow/api';
import { handleGreeting } from './workflows/handle-greeting';

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

The fetch handler returns `Response | undefined`, so you can hand off the `/.well-known/workflow/v1/*` routes to your router of choice (Elysia, Hono, etc.).

## Optional: annotate workflows from the manifest

```ts
import { annotateWorkflowsFromManifest } from 'workflow-bun/manifest';

await annotateWorkflowsFromManifest({
  manifestPath: '.well-known/workflow/manifest.json',
});
```

This mirrors the SWC client transform so `start()` can accept plain workflow functions even if you skip the transform.
