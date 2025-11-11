// src/routes/start-workflow/+server.ts
import { start } from 'workflow/runtime';
import { exampleWorkflow } from '$lib/workflows/example';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * This server route provides an API endpoint to trigger the `exampleWorkflow`.
 * It's a standard SvelteKit POST handler that can be called from a client
 * or another server.
 */
export const POST: RequestHandler = async () => {
  try {
    // For this example, we'll generate a random customer ID.
    // In a real application, you'd get this from the request body or session.
    const customerId = `customer-${Math.random().toString(36).substring(2, 9)}`;

    console.log(
      `Received request to start workflow for customer: ${customerId}`
    );

    // This `start` function call is where the magic happens.
    // At build time, the `cloudflareWorkflowTransformer` plugin replaces this
    // with a "shim" that forwards the request to your deployed Cloudflare World runtime
    // instead of attempting to execute it locally.
    const run = await start(exampleWorkflow, { customerId });

    console.log(`Successfully started workflow. Run ID: ${run.id}`);

    // Return the run ID to the client so it can be used to check the
    // status of the workflow later.
    return json({
      message: 'Workflow started successfully!',
      runId: run.id,
    });
  } catch (error) {
    console.error('Failed to start workflow:', error);

    const errorMessage =
      error instanceof Error ? error.message : 'An unknown error occurred';

    // Return a 500 error if the workflow fails to start. This could happen
    // if the service binding is misconfigured or the runtime is down.
    return json(
      { error: 'Failed to start workflow', details: errorMessage },
      { status: 500 }
    );
  }
};
