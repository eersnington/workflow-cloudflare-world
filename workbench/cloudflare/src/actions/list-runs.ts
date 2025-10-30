import {
  createRunsTable,
  showInfo,
  showSection,
  showWarning,
} from '@/core/ui.js';
import type { ActionContext } from './types.js';

export async function listRunsAction(ctx: ActionContext): Promise<void> {
  if (!ctx.state.runs.length) {
    showWarning('No runs available');
    return;
  }

  showSection('Recent Runs');
  console.log(createRunsTable(ctx.state.runs.slice(0, 15)));

  showInfo(
    `Showing ${Math.min(15, ctx.state.runs.length)} of ${ctx.state.runs.length} runs`
  );
}
