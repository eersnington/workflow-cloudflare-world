import Fastify from 'fastify';
import FastifyVite from '@fastify/vite';
import workflowFastify from '@workflow/fastify/server';
import { start } from 'workflow/api';
import { resolve } from 'node:path';
import { handleSignupWorkflow } from './workflows/example.js';

const server = Fastify({
  logger: true,
});

await server.register(FastifyVite, {
  // Point Fastify Vite at the project root so it can find vite.config.ts
  root: resolve(import.meta.dirname, '..'),
  distDir: resolve(import.meta.dirname, '..', 'dist'), // Must match build.outDir in Vite config
  dev: process.argv.includes('--dev'),
});

await server.vite.ready();

// Register workflow plugin
await server.register(workflowFastify);

console.log('Fastify Server created!');

// Trigger route
server.post('/signup', async (req: any, reply) => {
  const run = await start(handleSignupWorkflow, [
    req.body?.email || 'default@example.com',
  ]);
  return { ok: true, runId: run.runId };
});

// If running directly (via tsx src/server.ts or node dist/server.js)
if (import.meta.url === `file://${process.argv[1]}`) {
  await server.ready();
  await server.listen({ port: 3000 });
}

export const vite = {
  config: {
    api: true,
  },
};

export default server;
