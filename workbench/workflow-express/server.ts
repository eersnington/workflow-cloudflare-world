import 'workflow-express/register';
import express from 'express';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import {
  createWorkflowExpressBuilder,
  createWorkflowExpressRouter,
} from 'workflow-express';
import { start } from 'workflow/api';
import { handleGreeting } from './workflows/example.js';

const cwd = resolve(dirname(fileURLToPath(import.meta.url)));
const mode = process.argv.includes('--build') ? 'build' : 'serve';

await createWorkflowExpressBuilder({
  workingDir: cwd,
}).build();

if (mode === 'build') {
  console.log('Workflow bundles generated in .well-known/workflow/v1');
  process.exit(0);
}

const workflowRouter = await createWorkflowExpressRouter({
  buildDir: resolve(cwd, '.well-known/workflow/v1'),
});

const app = express();
app.use(workflowRouter);
app.use(express.json());

app.get('/healthz', (_req, res) => {
  res.send('ok');
});

app.post('/trigger', async (req, res, next) => {
  try {
    const name =
      typeof req.body?.name === 'string' ? req.body.name : 'workflow-user';
    const run = await start(handleGreeting, [name]);
    res.json({ runId: run.runId });
  } catch (error) {
    next(error);
  }
});

const port = Number.parseInt(process.env.PORT ?? '3154', 10);
app.listen(port, () => {
  console.log(`Workflow Express example running at http://127.0.0.1:${port}`);
});
