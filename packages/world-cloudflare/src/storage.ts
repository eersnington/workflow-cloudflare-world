import { WorkflowAPIError } from '@workflow/errors';
import type {
  Event,
  ListEventsParams,
  PaginatedResponse,
  Storage,
} from '@workflow/world';
import { and, desc, eq, gt, lt } from 'drizzle-orm';
import { monotonicFactory } from 'ulid';
import { type Drizzle, Schema } from './drizzle/index.js';
import type { SerializedContent } from './drizzle/schema.js';
import { compact } from './util.js';

export function createRunsStorage(drizzle: Drizzle): Storage['runs'] {
  const ulid = monotonicFactory();
  const { runs } = Schema;

  return {
    async get(id) {
      const [value] = await drizzle
        .select()
        .from(runs)
        .where(eq(runs.runId, id))
        .limit(1);
      if (!value) {
        throw new WorkflowAPIError(`Run not found: ${id}`, { status: 404 });
      }
      return compact(value);
    },
    async cancel(id) {
      const [value] = await drizzle
        .update(Schema.runs)
        .set({ status: 'cancelled', completedAt: new Date() })
        .where(eq(runs.runId, id))
        .returning();
      if (!value) {
        throw new WorkflowAPIError(`Run not found: ${id}`, { status: 404 });
      }
      return compact(value);
    },
    async pause(id) {
      const [value] = await drizzle
        .update(Schema.runs)
        .set({ status: 'paused' })
        .where(eq(runs.runId, id))
        .returning();
      if (!value) {
        throw new WorkflowAPIError(`Run not found: ${id}`, { status: 404 });
      }
      return compact(value);
    },
    async resume(id) {
      const [value] = await drizzle
        .update(Schema.runs)
        .set({ status: 'running' })
        .where(and(eq(runs.runId, id), eq(runs.status, 'paused')))
        .returning();
      if (!value) {
        throw new WorkflowAPIError(`Paused run not found: ${id}`, {
          status: 404,
        });
      }
      return compact(value);
    },
    async list(params) {
      const limit = params?.pagination?.limit ?? 20;
      const fromCursor = params?.pagination?.cursor;

      const all = await drizzle
        .select()
        .from(runs)
        .where(
          and(
            map(fromCursor, (c) => lt(runs.runId, c)),
            map(params?.workflowName, (wf) => eq(runs.workflowName, wf)),
            map(params?.status, (wf) => eq(runs.status, wf))
          )
        )
        .orderBy(desc(runs.runId))
        .limit(limit + 1);
      const values = all.slice(0, limit);
      const hasMore = all.length > limit;

      return {
        data: values.map(compact),
        hasMore,
        cursor: values.at(-1)?.runId ?? null,
      };
    },
    async create(data) {
      const runId = `wrun_${ulid()}`;
      const [value] = await drizzle
        .insert(runs)
        .values({
          runId,
          input: data.input,
          executionContext: data.executionContext as Record<
            string,
            unknown
          > | null,
          deploymentId: data.deploymentId,
          status: 'pending',
          workflowName: data.workflowName,
        })
        .onConflictDoNothing()
        .returning();
      if (!value) {
        throw new WorkflowAPIError(`Run ${runId} already exists`, {
          status: 409,
        });
      }
      return compact(value);
    },
    async update(id, data) {
      // Fetch current run to check if startedAt is already set
      const [currentRun] = await drizzle
        .select()
        .from(runs)
        .where(eq(runs.runId, id))
        .limit(1);

      if (!currentRun) {
        throw new WorkflowAPIError(`Run not found: ${id}`, { status: 404 });
      }

      const updates: Partial<typeof runs.$inferInsert> = {
        ...data,
        output: data.output as SerializedContent,
      };

      // Only set startedAt the first time transitioning to 'running'
      if (data.status === 'running' && !currentRun.startedAt) {
        updates.startedAt = new Date();
      }
      if (
        data.status === 'completed' ||
        data.status === 'failed' ||
        data.status === 'cancelled'
      ) {
        updates.completedAt = new Date();
      }

      const [value] = await drizzle
        .update(runs)
        .set(updates)
        .where(eq(runs.runId, id))
        .returning();
      if (!value) {
        throw new WorkflowAPIError(`Run not found: ${id}`, { status: 404 });
      }
      return compact(value);
    },
  };
}

function map<T, R>(obj: T | null | undefined, fn: (v: T) => R): undefined | R {
  return obj ? fn(obj) : undefined;
}

export function createEventsStorage(drizzle: Drizzle): Storage['events'] {
  const ulid = monotonicFactory();
  const { events } = Schema;

  return {
    async create(runId, data) {
      const eventId = `wevt_${ulid()}`;
      const [value] = await drizzle
        .insert(events)
        .values({
          runId,
          eventId,
          correlationId: data.correlationId,
          eventType: data.eventType,
          eventData: 'eventData' in data ? data.eventData : undefined,
        })
        .returning({ createdAt: events.createdAt });
      if (!value) {
        throw new WorkflowAPIError(`Event ${eventId} could not be created`, {
          status: 409,
        });
      }
      return { ...data, ...value, runId, eventId };
    },
    async list(params: ListEventsParams): Promise<PaginatedResponse<Event>> {
      const limit = params?.pagination?.limit ?? 100;
      const sortOrder = params.pagination?.sortOrder || 'asc';
      const order =
        sortOrder === 'desc'
          ? { by: desc(events.eventId), compare: lt }
          : { by: events.eventId, compare: gt };
      const all = await drizzle
        .select()
        .from(events)
        .where(
          and(
            eq(events.runId, params.runId),
            map(params.pagination?.cursor, (c) =>
              order.compare(events.eventId, c)
            )
          )
        )
        .orderBy(order.by)
        .limit(limit + 1);

      const values = all.slice(0, limit);

      return {
        data: values.map(compact) as Event[],
        cursor: values.at(-1)?.eventId ?? null,
        hasMore: all.length > limit,
      };
    },
    async listByCorrelationId(params) {
      const limit = params?.pagination?.limit ?? 100;
      const sortOrder = params.pagination?.sortOrder || 'asc';
      const order =
        sortOrder === 'desc'
          ? { by: desc(events.eventId), compare: lt }
          : { by: events.eventId, compare: gt };
      const all = await drizzle
        .select()
        .from(events)
        .where(
          and(
            eq(events.correlationId, params.correlationId),
            map(params.pagination?.cursor, (c) =>
              order.compare(events.eventId, c)
            )
          )
        )
        .orderBy(order.by)
        .limit(limit + 1);

      const values = all.slice(0, limit);

      return {
        data: values.map(compact) as Event[],
        cursor: values.at(-1)?.eventId ?? null,
        hasMore: all.length > limit,
      };
    },
  };
}
