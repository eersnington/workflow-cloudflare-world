import type { ExecutionContext, MessageBatch } from '@cloudflare/workers-types';

import type { CloudflareEnv } from './config.js';
import { loadWorkflowExecutorContainer } from './container-proxy.js';

import { handleQueueMessage } from './queue.js';
import { StreamCoordinator } from './stream-coordinator.js';

/**
 * This is the canonical entrypoint for the `workflow-cloudflare-world` runtime.
 * When deploying the runtime as a standalone application, your `wrangler.toml`
 * should point its `main` entry to this file.
 *
 * It wires together the queue handler, fetch handler, and Durable Object exports
 * needed for the runtime to operate correctly.
 */

// Export the Durable Object classes that need to be bound in wrangler.toml.
// WorkflowExecutorContainer is loaded dynamically to avoid pulling in runtime-only
// dependencies at build time in certain contexts.
export { StreamCoordinator };

export let WorkflowExecutorContainer: any;
(async () => {
  try {
    WorkflowExecutorContainer = await loadWorkflowExecutorContainer();
  } catch (error) {
    console.error(
      'Failed to dynamically load WorkflowExecutorContainer on worker startup:',
      error
    );
  }
})();

export default {
  /**
   * The `queue` handler is the primary entrypoint for triggering workflow and step
   * executions. It receives messages from Cloudflare Queues.
   */
  async queue(
    batch: MessageBatch,
    env: CloudflareEnv,
    _ctx: ExecutionContext
  ): Promise<void> {
    const promises = batch.messages.map(async (message) => {
      try {
        // The `handleQueueMessage` function is designed to be self-contained and
        // uses the `env` object to create a world instance internally.
        const result = await handleQueueMessage(env, message);

        if (result?.retryAfterSeconds) {
          message.retry({ delaySeconds: result.retryAfterSeconds });
        } else {
          message.ack();
        }
      } catch (error) {
        console.error(
          `Failed to process queue message ${message.id}. Retrying.`,
          error
        );
        message.retry();
      }
    });

    // Wait for all messages in the batch to be processed before finishing.
    await Promise.all(promises);
  },

  /**
   * The `fetch` handler serves as a secondary entrypoint. It provides structured
   * JSON responses for health checks and basic service information.
   */
  async fetch(
    request: Request,
    _env: CloudflareEnv,
    _ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    // A simple router for health checks and service info.
    switch (pathname) {
      case '/':
        return new Response(
          JSON.stringify({
            status: 'running',
            message: 'Workflow Cloudflare World is active.',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );

      case '/_health':
        // This endpoint can be expanded to check connectivity to D1, R2, etc.
        return new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });

      default:
        return new Response(JSON.stringify({ error: 'Not Found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
    }
  },
};
