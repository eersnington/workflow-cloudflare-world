import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorkflowBunBuilder } from 'workflow-bun';
import { createWorkflowBunFetchHandler } from 'workflow-bun/server';
import { annotateWorkflowsFromManifest } from 'workflow-bun/manifest';
import { start } from 'workflow/api';
import { handleGreeting } from './workflows/example.js';

const cwd = resolve(dirname(fileURLToPath(import.meta.url)));
const manifestPath = resolve(cwd, 'workflow-manifest.json');

await createWorkflowBunBuilder({
  workingDir: cwd,
  workflowManifestPath: manifestPath,
}).build();
await annotateWorkflowsFromManifest({
  manifestPath,
  workingDir: cwd,
});

const workflowFetch = await createWorkflowBunFetchHandler({
  buildDir: resolve(cwd, '.well-known/workflow/v1'),
  fetch: async (request) => {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/test') {
      const payload = await request
        .json()
        .catch(() => ({}) as { name?: string });
      const name =
        typeof payload?.name === 'string' ? payload.name : 'bun-user';
      const run = await start(handleGreeting, [name]);
      return Response.json({ runId: run.runId });
    }
    return new Response('Not Found', { status: 404 });
  },
});

const server = Bun.serve({
  port: 3153,
  fetch: workflowFetch,
});

console.log(
  `Workflow Bun example listening on http://localhost:${server.port}`
);
