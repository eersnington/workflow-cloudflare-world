import {
  type Event,
  type Hook,
  type Step,
  StepStatusSchema,
  type WorkflowRun,
  WorkflowRunStatusSchema,
} from '@workflow/world';
import {
  blob,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

function mustBeMoreThanOne<T>(t: T[]) {
  return t as [T, ...T[]];
}

/**
 * A mapped type that converts all properties of T to Drizzle ORM column definitions,
 * marking them as not nullable if they are not optional in T.
 */
type DrizzlishOfType<T extends object> = {
  [key in keyof T]-?: undefined extends T[key]
    ? { _: { notNull: boolean } }
    : { _: { notNull: true } };
};

/**
 * Sadly we do `any[]` right now
 */
export type SerializedContent = any[];

export const runs = sqliteTable(
  'workflow_runs',
  {
    runId: text('id').primaryKey(),
    output: text('output', { mode: 'json' }).$type<SerializedContent>(),
    deploymentId: text('deployment_id').notNull(),
    status: text('status', {
      enum: mustBeMoreThanOne(WorkflowRunStatusSchema.options),
    }).notNull(),
    workflowName: text('name').notNull(),
    executionContext: text('execution_context', { mode: 'json' }).$type<
      Record<string, any>
    >(),
    input: text('input', { mode: 'json' }).$type<SerializedContent>().notNull(),
    error: text('error'),
    errorCode: text('error_code'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date())
      .notNull(),
    completedAt: integer('completed_at', { mode: 'timestamp' }),
    startedAt: integer('started_at', { mode: 'timestamp' }),
  } satisfies DrizzlishOfType<WorkflowRun>,
  (tb) => ({
    workflowNameIdx: index('runs_workflow_name_idx').on(tb.workflowName),
    statusIdx: index('runs_status_idx').on(tb.status),
  })
);

export const events = sqliteTable(
  'workflow_events',
  {
    eventId: text('id').primaryKey(),
    eventType: text('type').$type<Event['eventType']>().notNull(),
    correlationId: text('correlation_id'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .$defaultFn(() => new Date())
      .notNull(),
    runId: text('run_id').notNull(),
    eventData: text('payload', { mode: 'json' }),
  } satisfies DrizzlishOfType<Event & { eventData?: undefined }>,
  (tb) => ({
    runFk: index('events_run_id_idx').on(tb.runId),
    correlationIdFk: index('events_correlation_id_idx').on(tb.correlationId),
  })
);

export const steps = sqliteTable(
  'workflow_steps',
  {
    runId: text('run_id').notNull(),
    stepId: text('step_id').primaryKey(),
    stepName: text('step_name').notNull(),
    status: text('status', {
      enum: mustBeMoreThanOne(StepStatusSchema.options),
    }).notNull(),
    input: text('input', { mode: 'json' }).$type<SerializedContent>().notNull(),
    output: text('output', { mode: 'json' }).$type<SerializedContent>(),
    error: text('error'),
    errorCode: text('error_code'),
    attempt: integer('attempt').notNull(),
    startedAt: integer('started_at', { mode: 'timestamp' }),
    completedAt: integer('completed_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date())
      .notNull(),
  } satisfies DrizzlishOfType<Step>,
  (tb) => ({
    runFk: index('steps_run_id_idx').on(tb.runId),
    statusIdx: index('steps_status_idx').on(tb.status),
  })
);

export const hooks = sqliteTable(
  'workflow_hooks',
  {
    runId: text('run_id').notNull(),
    hookId: text('hook_id').primaryKey(),
    token: text('token').notNull(),
    ownerId: text('owner_id').notNull(),
    projectId: text('project_id').notNull(),
    environment: text('environment').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .$defaultFn(() => new Date())
      .notNull(),
    metadata: text('metadata', { mode: 'json' }).$type<SerializedContent>(),
  } satisfies DrizzlishOfType<Hook>,
  (tb) => ({
    runFk: index('hooks_run_id_idx').on(tb.runId),
    tokenIdx: index('hooks_token_idx').on(tb.token),
  })
);

export const streams = sqliteTable(
  'workflow_stream_chunks',
  {
    chunkId: text('id').$type<`chnk_${string}`>().notNull(),
    streamId: text('stream_id').notNull(),
    chunkData: blob('data', { mode: 'buffer' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .$defaultFn(() => new Date())
      .notNull(),
    eof: integer('eof', { mode: 'boolean' }).notNull(),
  },
  (tb) => ({
    primaryKey: primaryKey({ columns: [tb.streamId, tb.chunkId] }),
    streamIdIdx: index('streams_stream_id_idx').on(tb.streamId),
  })
);
