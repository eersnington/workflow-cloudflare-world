import {
  type CloudflareEnv,
  createWorld,
  handleQueueMessage,
} from '@workflow/world-cloudflare';

type DemoStage = {
  id: string;
  name: string;
  minMs: number;
  maxMs: number;
  failureRate?: number;
};

type DemoTemplate = {
  id: string;
  name: string;
  description: string;
  failureRate: number;
  stages: DemoStage[];
};

type DemoRunOutput = {
  stages: Array<{ stageId: string; durationMs: number }>;
  completedStages?: Array<{ stageId: string; durationMs: number }>;
  totalDurationMs: number;
  error?: {
    stageId?: string;
    message: string;
    durationMs?: number;
  };
};

const WORKFLOW_TEMPLATES: DemoTemplate[] = [
  {
    id: 'random-sleep',
    name: 'Random Sleep',
    description: 'Single stage that succeeds after a random delay.',
    failureRate: 0,
    stages: [
      {
        id: 'sleep',
        name: 'Sleep Interval',
        minMs: 500,
        maxMs: 2500,
      },
    ],
  },
  {
    id: 'flaky-step',
    name: 'Flaky Step',
    description: 'Stage fails about 40% of the time after waiting.',
    failureRate: 0.4,
    stages: [
      {
        id: 'attempt',
        name: 'Flaky Execution',
        minMs: 800,
        maxMs: 3000,
      },
    ],
  },
  {
    id: 'inspection-chain',
    name: 'Inspection Chain',
    description: 'Three stages with varying delays to showcase timelines.',
    failureRate: 0.15,
    stages: [
      {
        id: 'prepare',
        name: 'Prepare Context',
        minMs: 400,
        maxMs: 1200,
        failureRate: 0.05,
      },
      {
        id: 'execute',
        name: 'Execute Core Logic',
        minMs: 1000,
        maxMs: 3200,
        failureRate: 0.2,
      },
      {
        id: 'finalize',
        name: 'Finalize Result',
        minMs: 500,
        maxMs: 1600,
        failureRate: 0.1,
      },
    ],
  },
];

export interface DemoWorkerEnv extends CloudflareEnv {
  DEPLOYMENT_ID?: string;
  SETUP_RUN?: string;
}

type CloudflareWorld = ReturnType<typeof createWorld>;

type RouteParams = Record<string, string>;

type RouteContext = {
  request: Request;
  env: DemoWorkerEnv;
  ctx: ExecutionContext;
  url: URL;
  world: CloudflareWorld;
  params: RouteParams;
};

type RouteHandler = (context: RouteContext) => Promise<Response>;

type RouteDefinition = {
  method: string;
  match: (url: URL) => RouteParams | null;
  handler: RouteHandler;
};

const ROUTE_DEFINITIONS: RouteDefinition[] = [
  { method: 'GET', match: matchExact('/'), handler: handleHealthCheck },
  {
    method: 'GET',
    match: matchExact('/workflows'),
    handler: handleListWorkflows,
  },
  { method: 'POST', match: matchExact('/runs'), handler: handleCreateRun },
  { method: 'GET', match: matchExact('/runs'), handler: handleListRuns },
  { method: 'GET', match: matchRunPath(), handler: handleGetRunDetails },
  { method: 'GET', match: matchRunPath('events'), handler: handleGetRunEvents },
  { method: 'GET', match: matchRunPath('steps'), handler: handleGetRunSteps },
  { method: 'POST', match: matchRunPath('retry'), handler: handleRetryRun },
  { method: 'POST', match: matchRunPath('cancel'), handler: handleCancelRun },
];

function matchExact(path: string): (url: URL) => RouteParams | null {
  return (url: URL) => (url.pathname === path ? {} : null);
}

function matchRunPath(segment?: string): (url: URL) => RouteParams | null {
  return (url: URL) => {
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length < 2) {
      return null;
    }
    if (segments[0] !== 'runs') {
      return null;
    }
    const runId = segments[1];
    if (!runId) {
      return null;
    }
    if (segment === undefined) {
      return segments.length === 2 ? { runId } : null;
    }
    if (segments.length !== 3) {
      return null;
    }
    if (segments[2] !== segment) {
      return null;
    }
    return { runId };
  };
}

async function handleHealthCheck({ env }: RouteContext): Promise<Response> {
  return Response.json({
    status: 'ok',
    service: 'world-cloudflare-demo',
    deploymentId: env.DEPLOYMENT_ID ?? 'demo',
  });
}

async function handleListWorkflows(): Promise<Response> {
  return Response.json({
    success: true,
    workflows: WORKFLOW_TEMPLATES.map((template) => ({
      id: template.id,
      name: template.name,
      description: template.description,
      stages: template.stages.length,
      failureRate: template.failureRate,
    })),
  });
}

async function handleCreateRun({
  request,
  env,
  world,
  ctx,
}: RouteContext): Promise<Response> {
  const body = (await request.json()) as {
    templateId?: string;
    input?: unknown[];
  };

  const templateId = body.templateId ?? WORKFLOW_TEMPLATES[0]?.id;
  if (!templateId) {
    return Response.json(
      { error: 'No workflow templates configured' },
      { status: 500 }
    );
  }

  const template = getTemplate(templateId);
  if (!template) {
    return Response.json(
      { error: `Unknown template: ${templateId}` },
      { status: 400 }
    );
  }

  const runInput = body.input ?? [];
  const run = await world.runs.create({
    workflowName: template.id,
    deploymentId: env.DEPLOYMENT_ID ?? 'cloudflare-demo',
    input: runInput,
  });

  ctx.waitUntil(processDemoRun(env, run.runId, template.id, runInput));

  return Response.json({
    success: true,
    run,
  });
}

async function handleListRuns({ url, world }: RouteContext): Promise<Response> {
  const workflowName = url.searchParams.get('workflowName') ?? undefined;
  const limit = Number(url.searchParams.get('limit')) || 20;

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

async function handleGetRunDetails({
  world,
  params,
}: RouteContext): Promise<Response> {
  const run = await world.runs.get(params.runId);

  return Response.json({
    success: true,
    run,
  });
}

async function handleGetRunEvents({
  world,
  params,
}: RouteContext): Promise<Response> {
  const events = await world.events.list({
    runId: params.runId,
    pagination: { limit: 100, sortOrder: 'asc' },
  });

  return Response.json({
    success: true,
    events: events.data,
    cursor: events.cursor,
    hasMore: events.hasMore,
  });
}

async function handleGetRunSteps({
  world,
  params,
}: RouteContext): Promise<Response> {
  const steps = await world.steps.list({
    runId: params.runId,
    pagination: { limit: 100 },
  });

  return Response.json({
    success: true,
    steps: steps.data,
    cursor: steps.cursor,
    hasMore: steps.hasMore,
  });
}

async function handleRetryRun({
  world,
  env,
  params,
  ctx,
}: RouteContext): Promise<Response> {
  const run = await world.runs.get(params.runId);
  const template = getTemplate(run.workflowName);

  if (!template) {
    return Response.json(
      { error: `Run uses unknown template: ${run.workflowName}` },
      { status: 400 }
    );
  }

  await world.runs.update(params.runId, {
    status: 'pending',
    output: [],
  });

  ctx.waitUntil(
    processDemoRun(env, params.runId, template.id, run.input ?? [])
  );

  return Response.json({ success: true });
}

async function handleCancelRun({
  world,
  params,
}: RouteContext): Promise<Response> {
  const run = await world.runs.cancel(params.runId);

  return Response.json({
    success: true,
    run,
  });
}

export default {
  async fetch(
    request: Request,
    env: DemoWorkerEnv,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    const world = createWorld(env);

    try {
      const method = request.method.toUpperCase();

      for (const definition of ROUTE_DEFINITIONS) {
        if (definition.method !== method) {
          continue;
        }

        const params = definition.match(url);
        if (!params) {
          continue;
        }

        return definition.handler({
          request,
          env,
          ctx,
          url,
          world,
          params,
        });
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

  async queue(batch: MessageBatch): Promise<void> {
    await handleQueueMessage(batch);
  },
};

async function processDemoRun(
  env: CloudflareEnv,
  runId: string,
  templateId: string,
  input: unknown[]
): Promise<void> {
  const template = getTemplate(templateId);

  if (!template) {
    return;
  }

  const world = createWorld(env);
  const startedAt = Date.now();
  const stepResults: Array<{ stageId: string; durationMs: number }> = [];

  await world.runs.update(runId, { status: 'running' });
  await world.events.create(runId, {
    eventType: 'workflow_started',
    correlationId: runId,
  });

  try {
    for (const stage of template.stages) {
      const stepId = `${stage.id}_${Date.now()}_${Math.floor(
        Math.random() * 1000
      )}`;

      await world.steps.create(runId, {
        stepId,
        stepName: stage.name,
        input: [
          {
            stageId: stage.id,
            stageName: stage.name,
            templateId: template.id,
            input,
          },
        ],
      });

      await world.steps.update(runId, stepId, { status: 'running' });
      await world.events.create(runId, {
        eventType: 'step_started',
        correlationId: stepId,
      });

      const durationMs = randomInt(stage.minMs, stage.maxMs);
      await sleep(durationMs);

      const stageFailureRate =
        stage.failureRate !== undefined
          ? stage.failureRate
          : template.failureRate;
      const failed = Math.random() < stageFailureRate;

      if (failed) {
        const failure = {
          stageId: stage.id,
          message: 'Simulated failure',
          durationMs,
        };

        await world.steps.update(runId, stepId, {
          status: 'failed',
          output: [failure],
        });

        await world.events.create(runId, {
          eventType: 'step_failed',
          correlationId: stepId,
          eventData: { error: failure },
        });

        await world.runs.update(runId, {
          status: 'failed',
          output: [
            {
              stages: stepResults,
              completedStages: stepResults,
              totalDurationMs: Date.now() - startedAt,
              error: {
                stageId: failure.stageId,
                message: failure.message,
                durationMs: failure.durationMs,
              },
            } satisfies DemoRunOutput,
          ],
        });

        await world.events.create(runId, {
          eventType: 'workflow_failed',
          correlationId: runId,
          eventData: { error: failure },
        });

        return;
      }

      const success = { stageId: stage.id, durationMs };
      stepResults.push(success);

      await world.steps.update(runId, stepId, {
        status: 'completed',
        output: [success],
      });

      await world.events.create(runId, {
        eventType: 'step_completed',
        correlationId: stepId,
        eventData: { result: success },
      });
    }

    const totalDurationMs = Date.now() - startedAt;

    await world.runs.update(runId, {
      status: 'completed',
      output: [
        {
          stages: stepResults,
          totalDurationMs,
        } satisfies DemoRunOutput,
      ],
    });

    await world.events.create(runId, {
      eventType: 'workflow_completed',
      correlationId: runId,
    });
  } catch (error) {
    await world.runs.update(runId, {
      status: 'failed',
      output: [
        {
          stages: stepResults,
          totalDurationMs: Date.now() - startedAt,
          error: serializeFailure(error),
        } satisfies DemoRunOutput,
      ],
    });

    await world.events.create(runId, {
      eventType: 'workflow_failed',
      correlationId: runId,
      eventData: { error: serializeFailure(error) },
    });
  }
}

function getTemplate(id: string): DemoTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((template) => template.id === id);
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function sleep(durationMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, durationMs));
}

function serializeFailure(error: unknown): {
  message: string;
  stageId?: string;
  durationMs?: number;
} {
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    const value = error as {
      message: string;
      stageId?: string;
      durationMs?: number;
    };
    return {
      message: value.message ?? 'Unknown error',
      stageId: value.stageId,
      durationMs: value.durationMs,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
    };
  }

  return { message: String(error) };
}
