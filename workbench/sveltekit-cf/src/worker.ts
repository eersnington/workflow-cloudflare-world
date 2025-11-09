import {
  StreamCoordinator,
  handleQueueMessage,
  type CloudflareEnv,
  type MessageBatch,
} from 'workflow-cloudflare-world';

export { StreamCoordinator };

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
