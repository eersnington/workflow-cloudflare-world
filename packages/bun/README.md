# workflow-bun

workflow-bun ships the Workflow DevKit runtime glue for Bun: build `.well-known/workflow/v1`, annotate workflows, and plug the HTTP routes into `Bun.serve()` with one helper.

```bash
bun add workflow workflow-bun
```

> Unless your app already runs the Workflow SWC transform, generate the workflow manifest and call `annotateWorkflowsFromManifest()` before invoking `start()`.

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

```ts
import { createWorkflowBunFetchHandler } from 'workflow-bun';
import { annotateWorkflowsFromManifest } from 'workflow-bun/manifest';
import { start } from 'workflow/api';
import { handleGreeting } from './workflows/handle-greeting';

await annotateWorkflowsFromManifest({
  manifestPath: '.well-known/workflow/manifest.json',
});

const appFetch = async (request: Request) => {
  if (
    request.method === 'POST' &&
    new URL(request.url).pathname === '/test'
  ) {
    const run = await start(handleGreeting, ['Ada']);
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

Docs: https://useworkflow.dev/docs/how-it-works/framework-integrations  
API reference: https://useworkflow.dev/docs/api-reference/workflow-bun
