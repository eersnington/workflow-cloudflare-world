import { select } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import { setPolling, upsertRun } from '@/core/state.js';
import { showSection } from '@/core/ui.js';
import type { WorkflowRun, WorkflowTemplate } from '@/server/worker-client.js';
import { inspectRunAction } from './inspect-run.js';
import type { ActionContext } from './types.js';

const orange = chalk.hex('#F38020');

export async function createRunAction(ctx: ActionContext): Promise<void> {
  const template = await selectTemplate(ctx.state.templates);
  const input = buildTemplateInput(template);

  showSection(`Creating run for ${orange.bold(template.name)}`);
  const spinner = ora('Dispatching workflow run...').start();

  ctx.poller.pause();

  try {
    const run = await ctx.client.createRun(template.id, input);
    ctx.state = upsertRun(ctx.state, run);
    spinner.succeed(`Run ${orange.bold(run.runId.slice(0, 12))} created`);

    await trackRunProgress(ctx, run.runId);
    showSection('Run Complete');
    await inspectRunAction(ctx, run.runId);
  } catch (error) {
    spinner.fail('Failed to create run');
    throw error;
  } finally {
    ctx.poller.resume(ctx.client, (runs: WorkflowRun[]) => {
      ctx.state = { ...ctx.state, runs };
    });
  }
}

async function selectTemplate(
  templates: WorkflowTemplate[]
): Promise<WorkflowTemplate> {
  if (!templates.length) {
    throw new Error('No workflow templates available');
  }

  showSection('Select Workflow Template');

  const templateId = await select({
    message: 'Choose a workflow to execute',
    choices: templates.map((t) => ({
      name: `${t.name} (${Math.round(t.failureRate * 100)}% fail)`,
      value: t.id,
      description: t.description,
    })),
  });

  const template = templates.find((t) => t.id === templateId);
  if (!template) {
    throw new Error(`Template ${templateId} not found`);
  }

  return template;
}

function buildTemplateInput(template: WorkflowTemplate): unknown[] {
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

async function trackRunProgress(
  ctx: ActionContext,
  runId: string
): Promise<void> {
  const spinner = ora('Watching run progress...').start();
  ctx.state = setPolling(ctx.state, true);

  try {
    const terminalRun = await ctx.client.watchRun(runId, {
      intervalMs: 750,
      onUpdate: (run: WorkflowRun) => {
        ctx.state = upsertRun(ctx.state, run);
        spinner.text = `Run status: ${orange(run.status)}`;
      },
    });

    ctx.state = upsertRun(ctx.state, terminalRun);

    const statusColor =
      terminalRun.status === 'completed'
        ? chalk.green
        : terminalRun.status === 'failed'
          ? chalk.red
          : chalk.yellow;

    spinner.succeed(
      `Run ${statusColor.bold(terminalRun.status.toUpperCase())}`
    );
  } catch (error) {
    spinner.fail('Run watcher error');
    throw error;
  } finally {
    ctx.state = setPolling(ctx.state, false);
  }
}
