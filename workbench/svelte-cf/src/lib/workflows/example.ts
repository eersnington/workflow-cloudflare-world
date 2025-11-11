// src/lib/workflows/example.ts

import { step } from 'workflow/workflow';

/**
 * A simple step function that simulates an asynchronous operation,
 * like calling an external API or querying a database.
 * Step functions have full access to the Node.js runtime when executed
 * by the deployed Cloudflare World.
 */
const processSomeData = step(
  'process-some-data',
  async (data: { someId: string }) => {
    'use step';
    console.log(`[Step] Starting to process data for ID: ${data.someId}`);

    // Simulate a network request or some other async work that takes time.
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const result = {
      processedAt: new Date().toISOString(),
      status: 'Completed',
      message: `Successfully processed data for ID: ${data.someId}.`,
    };

    console.log(`[Step] Finished processing.`);
    return result;
  }
);

/**
 * An example workflow function.
 * Workflow functions orchestrate calls to steps and other workflows.
 * They run in a deterministic, sandboxed environment inside the deployed
 * Cloudflare World's container and must not perform side effects directly.
 */
export async function exampleWorkflow(data: { customerId: string }) {
  'use workflow';
  console.log(`[Workflow] Execution started for customer: ${data.customerId}`);

  const processingResult = await processSomeData({ someId: data.customerId });

  console.log('[Workflow] Step completed. Finalizing workflow.');

  return {
    ...processingResult,
    workflowCompletedAt: new Date().toISOString(),
  };
}
