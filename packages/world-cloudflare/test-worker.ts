import { QueuePayloadSchema, ValidQueueName } from '@workflow/world';
import {
  type CloudflareEnv,
  createWorld,
  handleQueueMessage,
} from './src/index.js';

type CloudflareWorld = ReturnType<typeof createWorld>;

type RouteContext = {
  request: Request;
  env: CloudflareEnv;
  world: CloudflareWorld;
  url: URL;
};

type RouteHandler = (context: RouteContext) => Promise<Response>;

type RouteDefinition = {
  method: string;
  path: string;
  handler: RouteHandler;
};

const ROUTE_DEFINITIONS: RouteDefinition[] = [
  { method: 'GET', path: '/', handler: handleHealthCheck },
  { method: 'POST', path: '/runs', handler: handleCreateRun },
  { method: 'GET', path: '/runs', handler: handleListRuns },
  { method: 'POST', path: '/queue', handler: handleQueueRequest },
];

function getRouteHandler(
  method: string,
  pathname: string
): RouteHandler | undefined {
  return ROUTE_DEFINITIONS.find(
    (definition) => definition.method === method && definition.path === pathname
  )?.handler;
}

async function handleHealthCheck({ env }: RouteContext): Promise<Response> {
  return Response.json({
    status: 'ok',
    service: 'world-cloudflare',
    deploymentId: env.DEPLOYMENT_ID || 'unknown',
  });
}

async function handleCreateRun({
  request,
  env,
  world,
}: RouteContext): Promise<Response> {
  const body = (await request.json()) as {
    workflowName: string;
    input?: unknown[];
  };

  const run = await world.runs.create({
    workflowName: body.workflowName,
    input: body.input || [],
    deploymentId: env.DEPLOYMENT_ID || 'test',
  });

  return Response.json({
    success: true,
    run: {
      runId: run.runId,
      status: run.status,
      workflowName: run.workflowName,
      createdAt: run.createdAt,
    },
  });
}

async function handleRunDetails(
  pathname: string,
  world: CloudflareWorld
): Promise<Response> {
  const runId = pathname.split('/')[2];
  const run = await world.runs.get(runId);

  return Response.json({
    success: true,
    run: {
      runId: run.runId,
      status: run.status,
      workflowName: run.workflowName,
      input: run.input,
      output: run.output,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
    },
  });
}

async function handleListRuns({ url, world }: RouteContext): Promise<Response> {
  const workflowName = url.searchParams.get('workflowName') || undefined;
  const limitParam = url.searchParams.get('limit');
  const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : 20;
  const limit = Number.isNaN(parsedLimit) ? 20 : parsedLimit;

  const result = await world.runs.list({
    workflowName,
    pagination: { limit },
  });

  return Response.json({
    success: true,
    data: result.data,
    hasMore: result.hasMore,
    cursor: result.cursor,
  });
}

async function handleQueueRequest({
  request,
  world,
}: RouteContext): Promise<Response> {
  const body = (await request.json()) as {
    queueName: unknown;
    message: unknown;
    idempotencyKey?: string;
  };

  const queueName = ValidQueueName.parse(body.queueName);
  const payload = QueuePayloadSchema.parse(body.message);

  const result = await world.queue(queueName, payload, {
    idempotencyKey: body.idempotencyKey,
  });

  return Response.json({
    success: true,
    messageId: result.messageId,
  });
}

export default {
  async fetch(request: Request, env: CloudflareEnv): Promise<Response> {
    const url = new URL(request.url);
    const world = createWorld(env);

    try {
      const method = request.method.toUpperCase();
      const handler = getRouteHandler(method, url.pathname);

      if (handler) {
        return handler({ request, env, world, url });
      }

      if (method === 'GET' && url.pathname.startsWith('/runs/')) {
        return handleRunDetails(url.pathname, world);
      }

      return Response.json({ error: 'Not found' }, { status: 404 });
    } catch (error) {
      console.error('Error handling request:', error);
      return Response.json(
        {
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 }
      );
    }
  },

  async queue(batch: MessageBatch, _env: CloudflareEnv): Promise<void> {
    console.log(`Processing ${batch.messages.length} queue messages`);

    try {
      await handleQueueMessage(batch);
      console.log('Batch processed successfully');
    } catch (error) {
      console.error('Error processing batch:', error);
    }
  },
};
