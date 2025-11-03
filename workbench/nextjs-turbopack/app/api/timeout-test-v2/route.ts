import { start } from 'workflow/api';
import { longRunningWorkflowV2 } from '@/workflows/timeout-test-v2';

export async function POST() {
  console.log('Starting longRunningWorkflowV2 with sleep() for timeout test');

  try {
    const run = await start(longRunningWorkflowV2, []);
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
