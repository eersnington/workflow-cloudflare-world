import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const workflowPlugin: FastifyPluginAsync = async (fastify) => {
  const workingDir = process.cwd();
  // If we are in a build output (e.g. dist/), the well-known folder might be relative to that.
  // But following the plan: <project>/build/.well-known/workflow/v1/
  // We assume standard location relative to CWD or configured dist.

  const generatedDir = resolve(workingDir, '.well-known/workflow/v1');
  const manifestPath = join(generatedDir, 'manifest.json');

  try {
    const manifestContent = await readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestContent);

    const { handlers } = manifest;

    // Load handlers dynamically
    const [flow, step, webhook] = await Promise.all([
      import(join(generatedDir, handlers.flow)),
      import(join(generatedDir, handlers.step)),
      import(join(generatedDir, handlers.webhook)),
    ]);

    // Register routes
    // Note: We use `all` or specific methods based on what the bundle exports.
    // The BaseBuilder bundles export a generic handler that expects a Request object.
    // We need to adapt Fastify Request -> Web Request -> Response -> Fastify Reply

    // Helper to wrap Web Standard handler for Fastify
    const adapt = (handler: any) => async (req: any, reply: any) => {
      // Construct Web Request
      const webReq = new Request(
        new URL(req.url, `${req.protocol}://${req.hostname}`),
        {
          method: req.method,
          headers: req.headers as any,
          body: ['GET', 'HEAD'].includes(req.method)
            ? undefined
            : JSON.stringify(req.body),
        }
      );

      // Call handler
      // The generated bundles export a POST function (or others for webhook)
      const response = await handler.POST(webReq);

      // Send response
      reply.status(response.status);
      for (const [key, value] of response.headers) {
        reply.header(key, value);
      }
      return response.text(); // or arrayBuffer if binary
    };

    // Flow
    fastify.post('/.well-known/workflow/v1/flow', adapt(flow));

    // Step
    fastify.post('/.well-known/workflow/v1/step', adapt(step));

    // Webhook (Special case: path param + method handling)
    fastify.all(
      '/.well-known/workflow/v1/webhook/:token',
      async (req: any, reply: any) => {
        const webReq = new Request(
          new URL(req.url, `${req.protocol}://${req.hostname}`),
          {
            method: req.method,
            headers: req.headers as any,
            body: ['GET', 'HEAD'].includes(req.method)
              ? undefined
              : JSON.stringify(req.body),
          }
        );

        // Webhook bundle might export GET, POST, etc. matching the method
        const methodHandler = webhook[req.method];
        if (!methodHandler) {
          reply.status(405).send('Method Not Allowed');
          return;
        }

        const response = await methodHandler(webReq);

        reply.status(response.status);
        for (const [key, value] of response.headers) {
          reply.header(key, value);
        }
        return response.text();
      }
    );
  } catch (error) {
    fastify.log.warn(`[workflow] Failed to register routes: ${error}`);
    fastify.log.warn('[workflow] Ensure you have run the build or dev server.');
  }
};

export default fp(workflowPlugin, {
  name: 'workflow-fastify',
  fastify: '5.x',
});
