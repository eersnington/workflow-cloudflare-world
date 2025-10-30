import type {
  WorkflowEvent,
  WorkflowRun,
  WorkflowStep,
  WorkflowTemplate,
} from '@/server/worker-client.js';

export type ViewMode = 'dashboard' | 'detail';

export interface CLIState {
  templates: WorkflowTemplate[];
  runs: WorkflowRun[];
  selectedRunId: string | null;
  viewMode: ViewMode;
  events: WorkflowEvent[];
  steps: WorkflowStep[];
  lastUpdatedAt: Date | null;
  isPolling: boolean;
  errorMessage: string | null;
}

export function createInitialState(): CLIState {
  return {
    templates: [],
    runs: [],
    selectedRunId: null,
    viewMode: 'dashboard',
    events: [],
    steps: [],
    lastUpdatedAt: null,
    isPolling: false,
    errorMessage: null,
  };
}

export function selectRun(state: CLIState, runId: string | null): CLIState {
  return {
    ...state,
    selectedRunId: runId,
    viewMode: runId ? 'detail' : 'dashboard',
  };
}

export function updateRuns(state: CLIState, runs: WorkflowRun[]): CLIState {
  return {
    ...state,
    runs,
    lastUpdatedAt: new Date(),
  };
}

export function setRuns(state: CLIState, runs: WorkflowRun[]): CLIState {
  return {
    ...state,
    runs,
    lastUpdatedAt: new Date(),
  };
}

export function upsertRun(state: CLIState, run: WorkflowRun): CLIState {
  const runs = state.runs.slice();
  const index = runs.findIndex((item) => item.runId === run.runId);

  if (index >= 0) {
    runs[index] = run;
  } else {
    runs.unshift(run);
  }

  return {
    ...state,
    runs,
    lastUpdatedAt: new Date(),
  };
}

export function clearDetails(state: CLIState): CLIState {
  return {
    ...state,
    selectedRunId: null,
    viewMode: 'dashboard',
    events: [],
    steps: [],
  };
}

export function setTemplates(
  state: CLIState,
  templates: WorkflowTemplate[]
): CLIState {
  return {
    ...state,
    templates,
  };
}

export function setEvents(state: CLIState, events: WorkflowEvent[]): CLIState {
  return {
    ...state,
    events,
  };
}

export function setSteps(state: CLIState, steps: WorkflowStep[]): CLIState {
  return {
    ...state,
    steps,
  };
}

export function setPolling(state: CLIState, isPolling: boolean): CLIState {
  return {
    ...state,
    isPolling,
  };
}

export function setError(state: CLIState, message: string | null): CLIState {
  return {
    ...state,
    errorMessage: message,
  };
}
