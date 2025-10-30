import { select } from '@inquirer/prompts';
import type { CLIState } from '@/core/state.js';

export type MenuAction = 'create' | 'list' | 'inspect' | 'refresh' | 'exit';

export async function showMainMenu(state: CLIState): Promise<MenuAction> {
  const runningCount = state.runs.filter((r) => r.status === 'running').length;
  const pendingCount = state.runs.filter((r) => r.status === 'pending').length;
  const completedCount = state.runs.filter(
    (r) => r.status === 'completed'
  ).length;
  const failedCount = state.runs.filter((r) => r.status === 'failed').length;

  const statusText =
    state.runs.length > 0
      ? `${runningCount} running, ${pendingCount} pending, ${completedCount} completed, ${failedCount} failed`
      : 'No runs yet';

  const choices = [
    {
      name: '🚀 Create New Run',
      value: 'create' as const,
      description: 'Start a new workflow execution',
    },
    {
      name: `📊 View Recent Runs (${state.runs.length})`,
      value: 'list' as const,
      description: statusText,
    },
    {
      name: '🔍 Inspect Run Details',
      value: 'inspect' as const,
      description: 'View steps and events for a specific run',
      disabled: state.runs.length === 0 ? '(No runs available)' : false,
    },
    {
      name: '🔄 Refresh Status',
      value: 'refresh' as const,
      description: 'Manually refresh run status',
    },
    {
      name: '❌ Exit',
      value: 'exit' as const,
      description: 'Stop the demo and exit',
    },
  ];

  return select({
    message: 'What would you like to do?',
    choices,
    pageSize: 10,
  });
}
