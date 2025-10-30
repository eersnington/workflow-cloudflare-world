import chalk from 'chalk';
import ora from 'ora';
import {
  type CLIState,
  createInitialState,
  setRuns,
  setTemplates,
} from '@/core/state.js';
import { showBanner, showInfo } from '@/core/ui.js';
import { BackgroundPoller } from '@/server/poller.js';
import { WorkerClient } from '@/server/worker-client.js';

export interface AppContext {
  state: CLIState;
  client: WorkerClient;
  poller: BackgroundPoller;
}

export async function initialize(serverUrl: string): Promise<AppContext> {
  const client = new WorkerClient(serverUrl);
  let state = createInitialState();

  showBanner();

  await performHealthCheck(client);
  state = await loadTemplates(client, state);

  const { state: updatedState, canPoll } = await loadInitialRuns(client, state);
  state = updatedState;

  const poller = startPolling(
    client,
    (runs) => {
      state = setRuns(state, runs);
    },
    canPoll
  );

  if (canPoll) {
    console.log();
    showInfo('Background polling active - runs update every 2s');
    console.log();
  }

  return { state, client, poller };
}

async function performHealthCheck(client: WorkerClient): Promise<void> {
  const spinner = ora('Contacting Cloudflare worker...').start();

  try {
    const info = await client.healthCheck();
    spinner.succeed(
      `Connected to ${chalk.bold(info.service)} (${info.deploymentId})`
    );
  } catch (error) {
    spinner.fail('Failed to connect to worker');
    throw error;
  }
}

async function loadTemplates(
  client: WorkerClient,
  state: CLIState
): Promise<CLIState> {
  const spinner = ora('Fetching workflow templates...').start();

  try {
    const templates = await client.listWorkflows();
    spinner.succeed(`Loaded ${templates.length} templates`);
    return setTemplates(state, templates);
  } catch (error) {
    spinner.fail('Failed to load templates');
    throw error;
  }
}

async function loadInitialRuns(
  client: WorkerClient,
  state: CLIState
): Promise<{ state: CLIState; canPoll: boolean }> {
  const spinner = ora('Loading recent runs...').start();

  try {
    const result = await client.listRuns({ limit: 20 });
    spinner.succeed(`Loaded ${result.runs.length} runs`);
    return {
      state: setRuns(state, result.runs),
      canPoll: true,
    };
  } catch {
    spinner.warn('Database not initialized yet');
    console.log(
      chalk.gray('   Run history will be available after first workflow')
    );
    return {
      state,
      canPoll: false,
    };
  }
}

function startPolling(
  client: WorkerClient,
  onUpdate: (runs: import('../server/worker-client.js').WorkflowRun[]) => void,
  enabled: boolean
): BackgroundPoller {
  const poller = new BackgroundPoller();
  if (enabled) {
    poller.start(client, onUpdate, 2000);
  }
  return poller;
}
