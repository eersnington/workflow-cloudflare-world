# Fastify + Nitro Integration Guide

How to integrate Fastify with Nitro for Workflow support.

### 1. Configure Nitro
Configure `nitro.config.ts` to load the workflow module and direct all routes to your entry file.

```ts
import { defineNitroConfig } from 'nitro/config';

export default defineNitroConfig({
  modules: ['workflow/nitro'],
  vercel: { entryFormat: 'node' },
  routes: {
    '/**': './src/index.ts',
  },
});
```

### 2. Server Entry Adapter
In your entry file, bridge Nitro to Fastify by manually emitting the request event to Fastify's underlying server instance.

```ts
import Fastify from 'fastify';
import { fromNodeHandler } from 'nitro/h3';

const server = Fastify();
// ... register plugins & routes ...
await server.ready();

export default fromNodeHandler((req, res) => {
  // nitro expects the exported handler to wait until the response is complete
  // fixes FST_ERR_REP_ALREADY_SENT issue
  return new Promise((resolve) => {
    res.on('finish', resolve);
    server.server.emit('request', req, res);
  });
});
```

### 3. Create Workflows
Import your workflow and call `start()` within any standard Fastify route handler.

```ts
import { start } from 'workflow/api';
import { myWorkflow } from './workflows';

server.post('/trigger', async (req) => {
  const run = await start(myWorkflow, [req.body.data]);
  return { runId: run.runId };
});
```