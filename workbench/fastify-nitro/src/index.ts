import Fastify from 'fastify';
import { start } from 'workflow/api';
import { fromNodeHandler } from 'nitro/h3';
import { handleSignupWorkflow } from '../workflows/example.js';

const server = Fastify({
  logger: true,
});

// Register workflow plugin
// disabled for now
// await server.register(workflowFastify);

console.log('Fastify Server created!');

// Trigger route
server.get('/', async (req: any, reply) => {
  return { ok: true };
});

// Trigger route
server.post('/signup', async (req: any, reply) => {
  const run = await start(handleSignupWorkflow, [
    req.body?.email || 'default@example.com',
  ]);
  return { ok: true, runId: run.runId };
});

await server.ready();

export default fromNodeHandler((req, res) => {
  return new Promise((resolve) => {
    res.on('finish', resolve);
    server.server.emit('request', req, res);
  });
});
