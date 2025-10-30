import { confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { createRunAction } from '@/actions/create-run.js';
import { inspectRunAction } from '@/actions/inspect-run.js';
import { listRunsAction } from '@/actions/list-runs.js';
import { refreshAction } from '@/actions/refresh.js';
import type { ActionContext } from '@/actions/types.js';
import { type MenuAction, showMainMenu } from '@/core/menu.js';
import { showHeader, showInfo } from '@/core/ui.js';
import { initialize } from './initialize.js';

export async function runCLI(serverUrl: string): Promise<void> {
  const ctx = await initialize(serverUrl);

  let running = true;

  while (running) {
    const action = await showMainMenu(ctx.state);

    console.clear();
    showHeader(ctx.state, serverUrl);

    try {
      await executeAction(action, ctx);

      if (action !== 'exit') {
        await pauseForUser();
      } else {
        running = false;
      }
    } catch (error) {
      console.error(chalk.red('Action failed:'), error);
      await pauseForUser();
    }
  }

  ctx.poller.stop();
  showInfo('Goodbye!');
}

async function executeAction(
  action: MenuAction,
  ctx: ActionContext
): Promise<void> {
  switch (action) {
    case 'create':
      await createRunAction(ctx);
      break;
    case 'list':
      await listRunsAction(ctx);
      break;
    case 'inspect':
      await inspectRunAction(ctx);
      break;
    case 'refresh':
      await refreshAction(ctx);
      break;
    case 'exit':
      break;
  }
}

async function pauseForUser(): Promise<void> {
  await confirm({
    message: 'Return to main menu?',
    default: true,
  });
}
