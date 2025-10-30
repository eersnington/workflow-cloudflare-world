import chalk from 'chalk';
import Table from 'cli-table3';
import type {
  WorkflowEvent,
  WorkflowRun,
  WorkflowStep,
} from './worker-client.js';

const orange = chalk.hex('#F38020');

export function showBanner() {
  const banner = `
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║               CLOUDFLARE WORKFLOW DEMO                    ║
║                                                           ║
║        Testing @workflow/world-cloudflare v4.0            ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`;

  console.log(orange.bold(banner));
  console.log();
}

export function showSection(title: string) {
  console.log();
  console.log(orange.bold(`━━━ ${title} ━━━`));
  console.log();
}

export function showSuccess(message: string) {
  console.log(chalk.green('✓'), message);
}

export function showError(message: string) {
  console.log(chalk.red('✗'), message);
}

export function showInfo(message: string) {
  console.log(chalk.blue('ℹ'), message);
}

export function showWarning(message: string) {
  console.log(chalk.yellow('⚠'), message);
}

export function showStep(step: number, message: string) {
  console.log(chalk.bold.magenta(`[${step}]`), message);
}

export function createRunsTable(runs: WorkflowRun[]) {
  const table = new Table({
    head: [
      chalk.white('Run ID'),
      chalk.white('Workflow'),
      chalk.white('Status'),
      chalk.white('Created'),
    ],
    style: {
      head: [],
      border: ['gray'],
    },
  });

  for (const run of runs) {
    const statusIcon = getStatusIcon(run.status);
    table.push([
      chalk.dim(`${run.runId.slice(0, 12)}...`),
      run.workflowName,
      `${statusIcon} ${formatStatus(run.status)}`,
      new Date(run.createdAt).toLocaleTimeString(),
    ]);
  }

  return table.toString();
}

export function createDetailBox(title: string, data: Record<string, any>) {
  console.log();
  console.log(orange.bold(`╭─ ${title} ─╮`));

  for (const [key, value] of Object.entries(data)) {
    const formattedKey = chalk.white(key.padEnd(15));
    const formattedValue = formatValue(value);
    console.log(`│ ${formattedKey}: ${formattedValue}`);
  }

  console.log(orange.bold(`╰${'─'.repeat(title.length + 4)}╯`));
  console.log();
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'completed':
      return chalk.green('✓');
    case 'running':
      return chalk.blue('⟳');
    case 'pending':
      return chalk.yellow('⏳');
    case 'failed':
      return chalk.red('✗');
    case 'cancelled':
      return chalk.gray('⊗');
    default:
      return '○';
  }
}

export function formatStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatValue(value: any): string {
  if (value === null || value === undefined) {
    return chalk.dim('(none)');
  }
  if (typeof value === 'boolean') {
    return value ? chalk.green('true') : chalk.red('false');
  }
  if (typeof value === 'number') {
    return chalk.yellow(value.toString());
  }
  if (
    value instanceof Date ||
    (typeof value === 'string' && Date.parse(value))
  ) {
    return chalk.dim(new Date(value).toLocaleString());
  }
  if (Array.isArray(value)) {
    return chalk.dim(`[${value.length} items]`);
  }
  if (typeof value === 'object') {
    return chalk.dim(JSON.stringify(value));
  }
  return String(value);
}

export function showDivider() {
  console.log(chalk.gray('─'.repeat(60)));
}

export function showStatistics(stats: {
  totalRuns: number;
  successRate: number;
  avgDuration: number;
}) {
  console.log();
  console.log(chalk.bold.green('📊 Demo Statistics'));
  console.log();

  const table = new Table({
    style: { border: ['cyan'] },
  });

  table.push(
    ['Total Runs', chalk.bold(stats.totalRuns.toString())],
    ['Success Rate', chalk.bold(`${stats.successRate.toFixed(1)}%`)],
    ['Avg Duration', chalk.bold(`${stats.avgDuration.toFixed(0)}ms`)]
  );

  console.log(table.toString());
  console.log();
}

export function renderStepsTable(steps: WorkflowStep[]): string {
  if (!steps.length) {
    return chalk.gray('No step data recorded.');
  }

  const table = new Table({
    head: [
      chalk.white('Step'),
      chalk.white('Status'),
      chalk.white('Duration'),
      chalk.white('Attempt'),
    ],
    style: {
      head: [],
      border: ['gray'],
    },
  });

  for (const step of steps) {
    const statusIcon = getStatusIcon(step.status);
    const duration =
      step.completedAt && step.startedAt
        ? `${new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime()}ms`
        : chalk.dim('—');

    table.push([
      step.stepName,
      `${statusIcon} ${formatStatus(step.status)}`,
      duration,
      step.attempt,
    ]);
  }

  return table.toString();
}

export function renderEventsTimeline(events: WorkflowEvent[]): string {
  if (!events.length) {
    return chalk.gray('No events captured.');
  }

  const table = new Table({
    head: [
      chalk.white('Timestamp'),
      chalk.white('Event'),
      chalk.white('Correlation'),
    ],
    style: {
      head: [],
      border: ['gray'],
    },
  });

  for (const event of events) {
    table.push([
      new Date(event.createdAt).toLocaleTimeString(),
      formatStatus(event.eventType.replace('_', ' ')),
      event.correlationId
        ? chalk.dim(`${event.correlationId.slice(0, 12)}…`)
        : chalk.dim('—'),
    ]);
  }

  return table.toString();
}

export function showRunOverview(run: WorkflowRun) {
  createDetailBox('Run Summary', {
    'Run ID': run.runId,
    Workflow: run.workflowName,
    Status: `${getStatusIcon(run.status)} ${formatStatus(run.status)}`,
    Started: run.startedAt ? new Date(run.startedAt) : null,
    Completed: run.completedAt ? new Date(run.completedAt) : null,
    Deployment: run.deploymentId ?? '—',
  });
}

export function showFailureDetails(run: WorkflowRun) {
  if (run.status !== 'failed') {
    return;
  }

  const output = (run.output ?? {}) as Record<string, any>;
  const error = output.error ?? {};

  createDetailBox('Failure Details', {
    Stage: error.stageId ?? 'unknown',
    Message: error.message ?? 'No error message',
    Duration: error.durationMs ? `${error.durationMs}ms` : '—',
    'Total Duration': output.totalDurationMs
      ? `${output.totalDurationMs}ms`
      : '—',
  });
}
