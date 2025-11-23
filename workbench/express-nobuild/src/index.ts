import express from 'express';
import { start } from 'workflow/api';
import workflow from '@workflow/express';
import { handleGreeting } from '../lib/generated/workflows';

const app = express();

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

app.listen(port, () => {
  console.log(`Workflow Express example running at http://127.0.0.1:${port}`);
  console.log('Try posting to /trigger with: {"name": "your-name"}');
});
