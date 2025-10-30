import { spawn } from 'node:child_process';
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
import { WorkerClient, type WorkflowRun } from '@/server/worker-client.js';

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
    // Keep output clean; avoid dumping raw errors
    spinner.warn('Database not initialized yet');

    // Attempt auto-migration for local D1, then retry quietly
    const applied = await applyLocalMigrations();
    if (applied) {
      try {
        const result = await client.listRuns({ limit: 20 });
        spinner.succeed(`Initialized DB; loaded ${result.runs.length} runs`);
        return {
          state: setRuns(state, result.runs),
          canPoll: true,
        };
      } catch {
        // Silent retry failure; continue with clean UI
      }
    }

    console.log(
      chalk.gray('   Run history will be available after first workflow')
    );
    showInfo(
      'Tip: run "wrangler d1 migrations apply workflow-db-demo --local"'
    );
    return {
      state,
      canPoll: false,
    };
  }
}

function startPolling(
  client: WorkerClient,
  onUpdate: (runs: WorkflowRun[]) => void,
  enabled: boolean
): BackgroundPoller {
  const poller = new BackgroundPoller();
  if (enabled) {
    poller.start(client, onUpdate, 2000);
  }
  return poller;
}

async function applyLocalMigrations(): Promise<boolean> {
  const spinner = ora('Applying local D1 migrations...').start();
  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        'wrangler',
        ['d1', 'migrations', 'apply', 'workflow-db-demo', '--local'],
        { shell: true, stdio: ['ignore', 'pipe', 'pipe'] }
      );
      proc.on('error', reject);
      proc.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`wrangler exited with code ${code}`));
      });
    });
    spinner.succeed('Migrations applied');
    return true;
  } catch {
    spinner.fail('Failed to apply migrations');
    // keep UI clean; no raw error dump
    showInfo(
      'Manual fallback: wrangler d1 migrations apply workflow-db-demo --local'
    );
    return false;
  }
}
