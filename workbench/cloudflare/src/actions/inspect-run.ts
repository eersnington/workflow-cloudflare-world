import { select } from '@inquirer/prompts';
import ora from 'ora';
import { clearDetails, selectRun, setEvents, setSteps } from '@/core/state.js';
import {
  createDetailBox,
  renderEventsTimeline,
  renderStepsTable,
  showFailureDetails,
  showRunOverview,
  showSection,
  showWarning,
} from '@/core/ui.js';
import type { WorkflowRun } from '@/server/worker-client.js';
import type { ActionContext } from './types.js';

export async function inspectRunAction(
  ctx: ActionContext,
  runId?: string
): Promise<void> {
  const selectedRunId = runId || (await selectRunToInspect(ctx.state.runs));
  const run = ctx.state.runs.find((r) => r.runId === selectedRunId);

  if (!run) {
    showWarning(`Run ${selectedRunId} not found`);
    return;
  }

  ctx.state = selectRun(ctx.state, run.runId);

  showSection('Run Overview');
  showRunOverview(run);

  await loadAndDisplaySteps(ctx, run.runId);
  await loadAndDisplayEvents(ctx, run.runId);
  displayRunResult(run);

  ctx.state = clearDetails(ctx.state);
}

async function selectRunToInspect(runs: WorkflowRun[]): Promise<string> {
  if (!runs.length) {
    throw new Error('No runs available to inspect');
  }

  return select({
    message: 'Select a run to inspect',
    choices: runs.slice(0, 20).map((run) => ({
      name: `${run.runId.slice(0, 12)} - ${run.workflowName} [${run.status}]`,
      value: run.runId,
      description: `Created ${new Date(run.createdAt).toLocaleString()}`,
    })),
    pageSize: 10,
  });
}

async function loadAndDisplaySteps(
  ctx: ActionContext,
  runId: string
): Promise<void> {
  const spinner = ora('Loading step details@.').start();

  try {
    const steps = await ctx.client.getRunSteps(runId);
    ctx.state = setSteps(ctx.state, steps);
    spinner.succeed(`Loaded ${steps.length} steps`);

    if (steps.length > 0) {
      showSection('Workflow Steps');
      console.log(renderStepsTable(steps));
    }
  } catch (error) {
    spinner.fail('Failed to load steps');
    showWarning(error instanceof Error ? error.message : 'Unknown error');
  }
}

async function loadAndDisplayEvents(
  ctx: ActionContext,
  runId: string
): Promise<void> {
  const spinner = ora('Loading event timeline@.').start();

  try {
    const events = await ctx.client.getRunEvents(runId);
    ctx.state = setEvents(ctx.state, events);
    spinner.succeed(`Loaded ${events.length} events`);

    if (events.length > 0) {
      showSection('Timeline');
      console.log(renderEventsTimeline(events));
    }
  } catch (error) {
    spinner.fail('Failed to load events');
    showWarning(error instanceof Error ? error.message : 'Unknown error');
  }
}

function displayRunResult(run: WorkflowRun): void {
  if (run.status === 'failed') {
    showSection('Diagnostics');
    showWarning('Workflow failed, showing diagnostics');
    showFailureDetails(run);
  } else if (run.status === 'completed') {
    const output = (run.output ?? {}) as Record<string, unknown>;
    const totalDuration =
      typeof output.totalDurationMs === 'number'
        ? `${output.totalDurationMs}ms`
        : '—';
    const stagesCompleted = Array.isArray(output.stages)
      ? output.stages.length
      : 0;

    createDetailBox('Result', {
      'Total Duration': totalDuration,
      'Stages Completed': stagesCompleted,
    });
  }
}
