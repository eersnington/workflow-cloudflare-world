import { start } from 'workflow/api';
import { longRunningWorkflow } from '@/workflows/timeout-test';

export async function POST() {
  console.log('Starting longRunningWorkflow for timeout test');

  try {
    const run = await start(longRunningWorkflow, []);
    console.log('Run started:', run);
    return Response.json(run);
  } catch (err) {
    console.error('Failed to start timeout test workflow:', err);
    return Response.json(
      {
        error: 'Failed to start workflow',
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
