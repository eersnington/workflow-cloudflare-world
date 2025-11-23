import workflow from '@workflow/express';
import express, { type Express } from 'express';
import { start } from 'workflow/api';
import { handleGreeting } from '../lib/generated/workflows.js';

const app: Express = express();
const port = Number.parseInt(process.env.PORT ?? '3000', 10);

app.use(workflow());
app.use(express.json());

// Define your routes
app.get('/', (req, res) => {
  res.json({ message: 'Hello from Express on Vercel!' });
});

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

app.listen(port, () => {
  console.log(`Workflow Express example running on port ${port}`);
});

export default app;
