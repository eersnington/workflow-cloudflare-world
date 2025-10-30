import chalk from 'chalk';
import enquirer from 'enquirer';
import ora from 'ora';
import {
  type CLIState,
  clearDetails,
  createInitialState,
  selectRun,
  setError,
  setEvents,
  setPolling,
  setSteps,
  setTemplates,
  upsertRun,
} from './state.js';
import {
  createDetailBox,
  createRunsTable,
  renderEventsTimeline,
  renderStepsTable,
  showBanner,
  showDivider,
  showError,
  showFailureDetails,
  showInfo,
  showRunOverview,
  showSection,
  showWarning,
} from './ui.js';
import { WorkerClient, type WorkflowTemplate } from './worker-client.js';

export interface DemoOptions {
  baseURL?: string;
  showHistory?: boolean;
  autoLoop?: boolean;
}

export async function runDemo(options: DemoOptions = {}): Promise<void> {
  let state = createInitialState();
  const client = new WorkerClient(options.baseURL);

  showBanner();

  const healthSpinner = ora('Contacting Cloudflare worker...').start();
  try {
    const info = await client.healthCheck();
    healthSpinner.succeed(
      `Connected to ${chalk.bold(info.service)} (${info.deploymentId})`
    );
  } catch (error) {
    healthSpinner.fail('Failed to connect to worker');
    showError(formatError(error));
    throw error;
  }

  const templatesSpinner = ora('Fetching demo workflow templates...').start();
  try {
    const templates = await client.listWorkflows();
    state = setTemplates(state, templates);
    templatesSpinner.succeed(`Loaded ${templates.length} templates`);
  } catch (error) {
    templatesSpinner.fail('Unable to fetch workflow templates');
    showError(formatError(error));
    throw error;
  }

  let continueLoop = true;
  while (continueLoop) {
    const template = await pickTemplate(state.templates);
    const input = createTemplateInput(template);

    showSection(`Creating run for ${chalk.bold(template.name)}`);
    const createSpinner = ora('Dispatching workflow run...').start();

    try {
      const run = await client.createRun(template.id, input);
      state = upsertRun(state, run);
      createSpinner.succeed(`Run ${chalk.bold(run.runId)} created`);
      state = await trackRun(state, client, run.runId);
      await inspectRun(state, client);
    } catch (error) {
      createSpinner.fail('Failed to create run');
      state = setError(state, formatError(error));
      showError(state.errorMessage ?? 'Unknown error');
    }

    if (!options.autoLoop) {
      const { again } = await enquirer.prompt<{ again: boolean }>({
        type: 'confirm',
        name: 'again',
        message: 'Launch another demo run?',
        initial: true,
      });
      continueLoop = again;
      if (!continueLoop) {
        showInfo('Exiting demo');
      } else {
        showDivider();
      }
    }
  }
}

async function pickTemplate(
  templates: WorkflowTemplate[]
): Promise<WorkflowTemplate> {
  if (!templates.length) {
    throw new Error('No workflow templates available');
  }

  showSection('Select Workflow Template');
  const { templateId } = await enquirer.prompt<{ templateId: string }>({
    type: 'select',
    name: 'templateId',
    message: 'Choose a workflow to execute',
    choices: templates.map((template) => ({
      name: template.id,
      message: `${template.name} (${Math.round(
        template.failureRate * 100
      )}% fail)`,
      value: template.id,
      hint: template.description,
    })),
  });

  const template = templates.find((item) => item.id === templateId);
  if (!template) {
    throw new Error(`Template ${templateId} not found`);
  }
  return template;
}

function createTemplateInput(template: WorkflowTemplate): unknown[] {
  return [
    {
      timestamp: new Date().toISOString(),
      templateId: template.id,
      simulatedPayload: {
        stages: template.stages,
        failureRate: template.failureRate,
      },
    },
  ];
}

async function trackRun(
  state: CLIState,
  client: WorkerClient,
  runId: string
): Promise<CLIState> {
  const runSpinner = ora('Watching run progress...').start();
  state = setPolling(state, true);

  try {
    const terminalRun = await client.watchRun(runId, {
      intervalMs: 750,
      onUpdate: (run) => {
        state = upsertRun(state, run);
        runSpinner.text = `Run ${run.runId} is ${run.status}`;
      },
    });

    state = upsertRun(state, terminalRun);
    runSpinner.succeed(
      `Run ${terminalRun.runId} ${terminalRun.status.toUpperCase()}`
    );
  } catch (error) {
    runSpinner.fail('Run watcher encountered an error');
    showWarning(formatError(error));
  } finally {
    state = setPolling(state, false);
  }

  return state;
}

async function inspectRun(
  state: CLIState,
  client: WorkerClient
): Promise<void> {
  if (!state.runs.length) {
    return;
  }

  const run = state.runs[0];
  state = selectRun(state, run.runId);

  showSection('Run Overview');
  showRunOverview(run);

  const stepsSpinner = ora('Loading step details...').start();
  try {
    const steps = await client.getRunSteps(run.runId);
    state = setSteps(state, steps);
    stepsSpinner.succeed(`Loaded ${steps.length} steps`);
  } catch (error) {
    stepsSpinner.fail('Failed to load steps');
    showWarning(formatError(error));
  }

  const eventsSpinner = ora('Loading event timeline...').start();
  try {
    const events = await client.getRunEvents(run.runId);
    state = setEvents(state, events);
    eventsSpinner.succeed(`Loaded ${events.length} events`);
  } catch (error) {
    eventsSpinner.fail('Failed to load events');
    showWarning(formatError(error));
  }

  showSection('Workflow Steps');
  console.log(renderStepsTable(state.steps));

  showSection('Timeline');
  console.log(renderEventsTimeline(state.events));

  if (run.status === 'failed') {
    showSection('Diagnostics');
    showWarning('Workflow failed, showing diagnostics');
    showFailureDetails(run);
  } else if (run.status === 'completed') {
    const output = (run.output ?? {}) as Record<string, unknown>;
    createDetailBox('Result', {
      'Total Duration': formatDuration(output.totalDurationMs),
      'Stages Completed': (output.stages as unknown[])?.length ?? 0,
    });
  }

  state = clearDetails(state);

  if (state.runs.length > 1) {
    showSection('Recent Runs');
    console.log(createRunsTable(state.runs.slice(0, 5)));
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function formatDuration(value: unknown): string {
  if (typeof value === 'number') {
    return `${value}ms`;
  }
  return '—';
}
