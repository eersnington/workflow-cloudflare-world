import ora from 'ora';
import { setRuns } from '@/core/state.js';
import { showError } from '@/core/ui.js';
import type { ActionContext } from './types.js';

export async function refreshAction(ctx: ActionContext): Promise<void> {
  const spinner = ora('Refreshing run status...').start();

  try {
    const result = await ctx.client.listRuns({ limit: 20 });
    ctx.state = setRuns(ctx.state, result.runs);
    spinner.succeed(`Refreshed ${result.runs.length} runs`);

    ctx.poller.start(
      ctx.client,
      (runs) => {
        ctx.state = setRuns(ctx.state, runs);
      },
      2000
    );
  } catch {
    spinner.fail('Database not initialized yet');
    showError('Run "Create New Run" once to bootstrap workflow tables.');
  }
}
