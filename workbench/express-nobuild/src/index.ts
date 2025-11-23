import workflow from '@workflow/express';
import express, { type Express } from 'express';
import { start } from 'workflow/api';
import { handleGreeting } from '../lib/generated/workflows.js';

const app: Express = express();

app.use(workflow());
app.use(express.json());

app.get('/health', (_req, res) => {
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

// Local dev entrypoint; Vercel serverless will import the handler instead of listening
if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Workflow Express example running at http://127.0.0.1:${port}`);
    console.log('Try posting to /trigger with: {"name": "your-name"}');
  });
}

export default app;
