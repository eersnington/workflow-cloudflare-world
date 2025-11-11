import {
  StreamCoordinator,
  handleQueueMessage,
  loadWorkflowExecutorContainer,
  type CloudflareEnv,
  type MessageBatch,
} from 'workflow-cloudflare-world';
import { WorkflowExecutorContainer } from 'workflow-cloudflare-world';

// SvelteKit endpoint modules (+server) must only export valid HTTP handler names.
// Exposing library symbols like `StreamCoordinator` as top-level exports causes
// the builder to treat them as endpoint exports and fail the build.
// Re-export these as underscored names so they remain available for programmatic
// imports but are ignored by SvelteKit's endpoint analyzer.
export {
  StreamCoordinator as _StreamCoordinator,
  WorkflowExecutorContainer as _WorkflowExecutorContainer,
  loadWorkflowExecutorContainer as _loadWorkflowExecutorContainer,
};

export async function queue(
  batch: MessageBatch,
  env: CloudflareEnv
): Promise<void> {
  for (const message of batch.messages) {
    try {
      const result = await handleQueueMessage(env, message);
      if (result?.retryAfterSeconds) {
        message.retry({ delaySeconds: result.retryAfterSeconds });
      } else {
        message.ack();
      }
    } catch (error) {
      console.error('Failed to dispatch queue message', error);
      message.retry();
    }
  }
}
