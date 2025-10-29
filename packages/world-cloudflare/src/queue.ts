import {
  MessageId,
  type Queue,
  QueuePayloadSchema,
  type QueuePrefix,
  type ValidQueueName,
} from '@workflow/world';
import { createEmbeddedWorld } from '@workflow/world-local';
import { monotonicFactory } from 'ulid';
import type { CloudflareEnv } from './config.js';

/**
 * The Cloudflare queue works by creating two separate Cloudflare Queues:
 * - WORKFLOW_QUEUE for workflow jobs
 * - STEP_QUEUE for step jobs
 *
 * When a message is queued, it is sent to the appropriate Cloudflare Queue.
 * When a job is processed by a queue consumer, it is deserialized and re-queued
 * into the embedded world, allowing us to reuse the embedded world and build
 * hybrid architectures.
 */
export function createQueue(env: CloudflareEnv): Queue {
  const port = process.env.PORT ? Number(process.env.PORT) : undefined;
  const embeddedWorld = createEmbeddedWorld({ dataDir: undefined, port });

  const generateMessageId = monotonicFactory();

  const createQueueHandler = embeddedWorld.createQueueHandler;

  const getDeploymentId: Queue['getDeploymentId'] = async () => {
    return env.DEPLOYMENT_ID || 'cloudflare';
  };

  const queue: Queue['queue'] = async (queueName, message, opts) => {
    const [prefix, queueId] = parseQueueName(queueName);
    const cfQueue =
      prefix === '__wkf_workflow_' ? env.WORKFLOW_QUEUE : env.STEP_QUEUE;
    const messageId = MessageId.parse(`msg_${generateMessageId()}`);

    await cfQueue.send(
      {
        queueName,
        queueId,
        message,
        messageId,
        idempotencyKey: opts?.idempotencyKey,
        attempt: 1,
      },
      {
        contentType: 'json',
      }
    );

    return { messageId };
  };

  return {
    createQueueHandler,
    getDeploymentId,
    queue,
  };
}

const parseQueueName = (name: ValidQueueName): [QueuePrefix, string] => {
  const prefixes: QueuePrefix[] = ['__wkf_step_', '__wkf_workflow_'];
  for (const prefix of prefixes) {
    if (name.startsWith(prefix)) {
      return [prefix, name.slice(prefix.length)];
    }
  }
  throw new Error(`Invalid queue name: ${name}`);
};

/**
 * Queue consumer handler to be used in a Cloudflare Worker
 * This processes messages from Cloudflare Queues and forwards them to the embedded world
 */
export async function handleQueueMessage(
  batch: MessageBatch,
  env: CloudflareEnv
): Promise<void> {
  const embeddedWorld = createEmbeddedWorld({ dataDir: undefined });

  for (const message of batch.messages) {
    try {
      const body = message.body as {
        queueName: ValidQueueName;
        queueId: string;
        message: unknown;
        messageId: string;
        idempotencyKey?: string;
        attempt: number;
      };

      const parsedMessage = QueuePayloadSchema.parse(body.message);
      await embeddedWorld.queue(body.queueName, parsedMessage, {
        idempotencyKey: body.idempotencyKey,
      });

      message.ack();
    } catch (error) {
      console.error('Error processing queue message:', error);
      message.retry();
    }
  }
}
