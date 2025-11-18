import { Buffer } from 'node:buffer';
import http from 'node:http';
import process from 'node:process';
import { createWorkflowNodeFetchHandler, getWorkflow } from 'workflow-node';
import { start } from 'workflow/api';

const workflowHandler = await createWorkflowNodeFetchHandler();
const handleGreeting = await getWorkflow('handleGreeting');

const server = http.createServer(async (req, res) => {
  if (await workflowHandler(req, res)) {
    return;
  }

  if (
    req.method === 'POST' &&
    new URL(req.url ?? '', 'http://localhost').pathname === '/test'
  ) {
    const payload = await readJsonBody(req);
    const name =
      typeof payload?.name === 'string' ? payload.name : 'workflow-user';
    const run = await start(handleGreeting, [name]);

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ runId: run.runId }));
    return;
  }

  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('Not Found');
});

const port = Number.parseInt(process.env.PORT || '3152', 10);
server.listen(port, () => {
  console.log(`Workflow Node example running at http://127.0.0.1:${port}`);
});

async function readJsonBody(req: http.IncomingMessage) {
  if (req.method === 'GET' || req.method === 'HEAD' || !req.readable) {
    return undefined;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
      name?: string;
    };
  } catch {
    return undefined;
  }
}
