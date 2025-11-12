import type { ExecutionContext, MessageBatch } from '@cloudflare/workers-types';
import type { CloudflareEnv } from './config.js';
import { loadWorkflowExecutorContainer } from './container-proxy.js';
import { handleQueueMessage } from './queue.js';

export { StreamCoordinator } from './stream-coordinator.js';

export let WorkflowExecutorContainer: unknown;

void (async () => {
  try {
    WorkflowExecutorContainer = await loadWorkflowExecutorContainer();
  } catch (error) {
    console.error(
      'Failed to load WorkflowExecutorContainer at startup:',
      error
    );
  }
})();

export default {
  async queue(
    batch: MessageBatch,
    env: CloudflareEnv,
    _ctx: ExecutionContext
  ): Promise<void> {
    await Promise.all(
      batch.messages.map(async (message) => {
        try {
          const result = await handleQueueMessage(env, message);
          if (result?.retryAfterSeconds) {
            message.retry({ delaySeconds: result.retryAfterSeconds });
          } else {
            message.ack();
          }
        } catch (error) {
          console.error(
            `Error processing queue message ${message.id}; scheduling retry.`,
            error
          );
          message.retry();
        }
      })
    );
  },

  async fetch(
    request: Request,
    _env: CloudflareEnv,
    _ctx: ExecutionContext
  ): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === '/_health') {
      return Response.json({ status: 'ok' });
    }

    if (pathname === '/') {
      return Response.json({
        status: 'running',
        message: 'Workflow Cloudflare World runtime is online.',
      });
    }

    return new Response('Not Found', { status: 404 });
  },
};
