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
   * The `fetch` handler serves as a secondary entrypoint. It can be used for
   * simple health checks or to implement custom administrative APIs for the runtime.
   * The primary interaction with the workflow system should happen via queues.
   */
  async fetch(
    request: Request,
    _env: CloudflareEnv,
    _ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    // Provide a basic health check endpoint.
    if (url.pathname === '/_health') {
      // In a real-world scenario, you might add checks here to ensure
      // connectivity to D1, R2, etc.
      return new Response('ok', { status: 200 });
    }

    // For any other request, return a simple status message.
    return new Response('Workflow Cloudflare World is running.', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  },
};
