import Fastify from 'fastify';
import workflow from 'workflow-fastify';
import { start } from 'workflow/api';
import { handleGreeting } from './workflows/example.js';

const fastify = Fastify({
  logger: true,
});

await fastify.register(workflow, {
  dirs: ['workflows'],
  workflowManifestPath: '.well-known/workflow/manifest.json',
  hmr: process.env.NODE_ENV !== 'production',
});

fastify.get('/health', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
}));

fastify.post('/greet', async (request) => {
  const { name } = request.body as { name: string };
  const run = await start(handleGreeting, [name]);
  return {
    success: true,
    runId: run.runId,
    message: `Greeting workflow started for ${name}`,
  };
});

await fastify.listen({ port: 3155 });
