import type { Message } from '@cloudflare/workers-types';
import {
  MessageId,
  type Queue,
  QueuePayloadSchema,
  type QueuePrefix,
  ValidQueueName,
} from '@workflow/world';
import { monotonicFactory } from 'ulid';
import { z } from 'zod';
import type { CloudflareEnv } from './config.js';

/**
 * The Cloudflare World queue works by creating two separate Cloudflare Queues:
 * - WORKFLOW_QUEUE for workflow jobs
 * - STEP_QUEUE for step jobs
 *
 * When a message is queued, it is sent to the appropriate Cloudflare Queue.
 * When a job is processed by a queue consumer, it is deserialized and re-queued
 * into the embedded world, allowing us to reuse the embedded world and build
 * hybrid architectures.
 */
export function createQueue(env: CloudflareEnv): Queue {
  const generateMessageId = monotonicFactory();

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

  const createQueueHandler: Queue['createQueueHandler'] = (prefix, handler) => {
    return async (req) => {
      const headerEntries: [string, string][] = [];
      req.headers.forEach((value, key) => {
        headerEntries.push([key, value]);
      });
      const headers = HeaderParser.safeParse(Object.fromEntries(headerEntries));
      if (!headers.success || !req.body) {
        return Response.json(
          {
            error: !req.body
              ? 'Missing request body'
              : 'Missing required headers',
          },
          { status: 400 }
        );
      }

      const queueName = headers.data['x-vqs-queue-name'];
      const messageId = headers.data['x-vqs-message-id'];
      const attempt = headers.data['x-vqs-message-attempt'];

      if (!queueName.startsWith(prefix)) {
        return Response.json({ error: 'Unhandled queue' }, { status: 400 });
      }

      let body: unknown;
      try {
        body = await req.json();
      } catch (error) {
        console.error('Failed to parse queue payload', error);
        return Response.json(
          { error: 'Invalid request body' },
          { status: 400 }
        );
      }

      try {
        const result = await handler(body, { attempt, queueName, messageId });
        if (result && typeof result.timeoutSeconds === 'number') {
          return Response.json(
            { timeoutSeconds: result.timeoutSeconds },
            { status: 503 }
          );
        }

        return Response.json({ ok: true });
      } catch (error) {
        console.error('Error handling queue request', error);
        return Response.json(String(error), { status: 500 });
      }
    };
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
 * Queue consumer handler to be used in a Cloudflare Worker.
 * This processes messages from Cloudflare Queues and forwards them to the
 * deployed workflow routes via either a service binding or an external URL.
 *
 * UPDATED: Routes workflow execution to containers, step execution remains in Workers
 */
export async function handleQueueMessage(
  env: CloudflareEnv,
  message: Message<unknown>
): Promise<{ retryAfterSeconds?: number } | undefined> {
  const envelope = QueueEnvelope.parse(message.body);

  // Route workflow jobs to containers, step jobs stay in Workers
  if (envelope.queueName.startsWith('__wkf_workflow_')) {
    return handleWorkflowJob(env, envelope);
  } else if (envelope.queueName.startsWith('__wkf_step_')) {
    const dispatcher = createDispatcher(env);
    return handleStepJob(envelope, dispatcher);
  } else {
    throw new Error(`Unknown queue type: ${envelope.queueName}`);
  }
}

/**
 * Handle workflow job execution in containers
 */
async function handleWorkflowJob(
  env: CloudflareEnv,
  envelope: z.infer<typeof QueueEnvelope>
): Promise<{ retryAfterSeconds?: number } | undefined> {
  // Route to containers via dispatcher (same as step jobs but different endpoint)
  const dispatcher = createDispatcher(env);
  const path = FLOW_ENDPOINT;
  const request = new Request(new URL(path, dispatcher.baseUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-vqs-queue-name': envelope.queueName,
      'x-vqs-message-id': envelope.messageId,
      'x-vqs-message-attempt': String(envelope.attempt + 1),
    },
    body: JSON.stringify(envelope.message),
  });

  const response = await dispatcher.fetch(request);
  if (response.ok) {
    return;
  }

  if (response.status === 503) {
    const retry = await parseRetry(response);
    if (retry) {
      return { retryAfterSeconds: retry };
    }
  }

  const text = await response.text();
  throw new Error(
    `Queue dispatch failed with status ${response.status}: ${text || 'No body'}`
  );
}

/**
 * Handle step job execution in Workers (unchanged logic)
 */
async function handleStepJob(
  envelope: z.infer<typeof QueueEnvelope>,
  dispatcher: Dispatcher
): Promise<{ retryAfterSeconds?: number } | undefined> {
  const path = STEP_ENDPOINT;
  const request = new Request(new URL(path, dispatcher.baseUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-vqs-queue-name': envelope.queueName,
      'x-vqs-message-id': envelope.messageId,
      'x-vqs-message-attempt': String(envelope.attempt + 1),
    },
    body: JSON.stringify(envelope.message),
  });

  const response = await dispatcher.fetch(request);
  if (response.ok) {
    return;
  }

  if (response.status === 503) {
    const retry = await parseRetry(response);
    if (retry) {
      return { retryAfterSeconds: retry };
    }
  }

  const text = await response.text();
  throw new Error(
    `Queue dispatch failed with status ${response.status}: ${text || 'No body'}`
  );
}

const STEP_ENDPOINT = '/.well-known/workflow/v1/step';
const FLOW_ENDPOINT = '/.well-known/workflow/v1/flow';
const INTERNAL_DISPATCH_BASE_URL = 'https://workflow.internal';

const HeaderParser = z.object({
  'x-vqs-queue-name': ValidQueueName,
  'x-vqs-message-id': MessageId,
  'x-vqs-message-attempt': z.coerce.number().int().min(1),
});

const QueueEnvelope = z.object({
  queueName: ValidQueueName,
  queueId: z.string(),
  message: QueuePayloadSchema,
  messageId: z.string(),
  idempotencyKey: z.string().optional(),
  attempt: z.number().int().min(1),
});

interface Dispatcher {
  baseUrl: string;
  fetch(request: Request): Promise<Response>;
}

function createDispatcher(env: CloudflareEnv): Dispatcher {
  const { WORKFLOW_DISPATCH: serviceBinding, WORKFLOW_DISPATCH_URL: url } = env;

  if (serviceBinding) {
    return {
      baseUrl: INTERNAL_DISPATCH_BASE_URL,
      fetch(request) {
        return serviceBinding.fetch(request);
      },
    };
  }

  if (url) {
    return {
      baseUrl: url,
      fetch(request) {
        return fetch(request);
      },
    };
  }

  throw new Error(
    'WORKFLOW_DISPATCH service binding or WORKFLOW_DISPATCH_URL must be configured'
  );
}

async function parseRetry(response: Response): Promise<number | undefined> {
  try {
    const body = (await response.json()) as { timeoutSeconds?: unknown };
    if (
      body &&
      typeof body.timeoutSeconds === 'number' &&
      Number.isFinite(body.timeoutSeconds)
    ) {
      return Math.max(0, body.timeoutSeconds);
    }
  } catch {
    // ignore JSON parse errors, fall through
  }
  return undefined;
}
