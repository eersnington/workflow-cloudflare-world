import axios, { type AxiosInstance } from 'axios';

export type RunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  stages: number;
  failureRate: number;
}

export interface WorkflowRun {
  runId: string;
  workflowName: string;
  status: RunStatus;
  input: unknown[];
  output?: unknown;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  deploymentId?: string;
}

export interface WorkflowEvent {
  eventId: string;
  runId: string;
  eventType: string;
  correlationId?: string;
  createdAt: string;
  eventData?: unknown;
}

export interface WorkflowStep {
  stepId: string;
  runId: string;
  stepName: string;
  status: string;
  attempt: number;
  input: unknown[];
  output?: unknown;
  error?: unknown;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListRunsOptions {
  workflowName?: string;
  limit?: number;
}

export interface WatchRunOptions {
  intervalMs?: number;
  timeoutMs?: number;
  onUpdate?: (run: WorkflowRun) => void;
}

const TERMINAL_STATUSES: RunStatus[] = ['completed', 'failed', 'cancelled'];

export class WorkerClient {
  private client: AxiosInstance;

  constructor(baseURL = 'http://localhost:8787') {
    this.client = axios.create({
      baseURL,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async healthCheck(): Promise<{
    status: string;
    service: string;
    deploymentId: string;
  }> {
    const { data } = await this.client.get('/');
    return data;
  }

  async listWorkflows(): Promise<WorkflowTemplate[]> {
    const { data } = await this.client.get('/workflows');
    return data.workflows;
  }

  async createRun(
    templateId: string,
    input: unknown[] = []
  ): Promise<WorkflowRun> {
    const { data } = await this.client.post('/runs', { templateId, input });
    return data.run;
  }

  async retryRun(runId: string): Promise<void> {
    await this.client.post(`/runs/${runId}/retry`);
  }

  async cancelRun(runId: string): Promise<WorkflowRun> {
    const { data } = await this.client.post(`/runs/${runId}/cancel`);
    return data.run;
  }

  async getRun(runId: string): Promise<WorkflowRun> {
    const { data } = await this.client.get(`/runs/${runId}`);
    return data.run;
  }

  async listRuns(params?: ListRunsOptions): Promise<{
    runs: WorkflowRun[];
    hasMore: boolean;
    cursor: string | null;
  }> {
    const search = new URLSearchParams();
    if (params?.workflowName) search.set('workflowName', params.workflowName);
    if (params?.limit) search.set('limit', params.limit.toString());

    const path = search.size ? `/runs?${search.toString()}` : '/runs';
    const { data } = await this.client.get(path);
    return {
      runs: data.data,
      hasMore: data.hasMore,
      cursor: data.cursor,
    };
  }

  async getRunEvents(runId: string): Promise<WorkflowEvent[]> {
    const { data } = await this.client.get(`/runs/${runId}/events`);
    return data.events;
  }

  async getRunSteps(runId: string): Promise<WorkflowStep[]> {
    const { data } = await this.client.get(`/runs/${runId}/steps`);
    return data.steps;
  }

  async watchRun(
    runId: string,
    options: WatchRunOptions = {}
  ): Promise<WorkflowRun> {
    const interval = options.intervalMs ?? 750;
    const timeout = options.timeoutMs ?? 120_000;
    const started = Date.now();

    while (true) {
      const run = await this.getRun(runId);
      options.onUpdate?.(run);

      if (TERMINAL_STATUSES.includes(run.status)) {
        return run;
      }

      if (Date.now() - started > timeout) {
        throw new Error(`Timed out waiting for run ${runId}`);
      }

      await delay(interval);
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
