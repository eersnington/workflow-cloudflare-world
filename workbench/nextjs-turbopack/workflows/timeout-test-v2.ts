import { sleep } from 'workflow';

const DURATION_MS = 342000;

export async function longRunningWorkflowV2() {
  'use workflow';
  console.log(
    'Starting long-running workflow with sleep() api at:',
    new Date().toISOString()
  );

  console.log(
    `Starting long-running step with sleep() that will run for ${DURATION_MS}ms at:`,
    new Date().toISOString()
  );

  await sleep(`${DURATION_MS}ms`);

  console.log(
    `Completed long-running step with sleep() after ${DURATION_MS}ms at:`,
    new Date().toISOString()
  );

  console.log(
    'Completed long-running workflow with sleep() api :',
    new Date().toISOString()
  );
  return true;
}
