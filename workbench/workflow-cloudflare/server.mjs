import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { createWorkflowCloudflareBuilder } from 'workflow-cloudflare/builder';
import { annotateWorkflowsFromManifest } from 'workflow-cloudflare/manifest';
import { createWorkflowCloudflareWorker } from 'workflow-cloudflare';
import { start } from 'workflow/api';
import { handleGreeting } from './workflows/example.js';

const cwd = resolve(dirname(fileURLToPath(import.meta.url)));
const shouldBuild = process.argv.includes('--build');
const manifestPath = resolve(cwd, 'workflow-manifest.json');
const buildDir = resolve(cwd, '.well-known/workflow/v1');

const builder = createWorkflowCloudflareBuilder({
  workingDir: cwd,
  workflowManifestPath: manifestPath,
});
await builder.build();
await annotateWorkflowsFromManifest({ manifestPath, workingDir: cwd });

if (shouldBuild) {
  console.log('Workflow bundles generated in .well-known/workflow/v1');
  process.exit(0);
}

const worker = await createWorkflowCloudflareWorker({
  buildDir,
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/test') {
      const input = await request.json().catch(() => ({}));
      const name =
        typeof input?.name === 'string' ? input.name : 'workflow-user';
      const run = await start(handleGreeting, [name]);
      return Response.json({ runId: run.runId });
    }
    return new Response('Not Found', { status: 404 });
  },
});

const { fetch } = worker;

const host = '127.0.0.1';
const port = Number(process.env.PORT || 8787);

const http = await import('node:http');
const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${host}:${port}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers ?? {})) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        headers.append(key, entry);
      }
    } else if (typeof value === 'string') {
      headers.append(key, value);
    }
  }
  const request = new Request(url.toString(), {
    method: req.method,
    headers,
    body: req,
    duplex: 'half',
  });

  fetch(request, {}, {}).then((response) => {
    res.writeHead(response.status, Object.fromEntries(response.headers));
    response.arrayBuffer().then((buffer) => {
      res.end(Buffer.from(buffer));
    });
  });
});

server.listen(port, host, () => {
  console.log(`Workflow Cloudflare example running at http://${host}:${port}`);
});
