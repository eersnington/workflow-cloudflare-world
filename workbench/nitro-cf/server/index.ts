import { eventHandler } from 'h3';
import { setupGlobalContainerClient } from 'workflow-cloudflare-bindings';
import { start } from 'workflow/runtime';

export default eventHandler(async (event) => {
  // In a Cloudflare environment, the `env` object is available in the event context.
  // This is where service bindings (like our connection to the workflow runtime) live.
  const env = event.context.cloudflare?.env;

  if (!env) {
    // If not running in a Cloudflare environment (e.g., local `nitro dev`),
    // the bindings will fall back to using the `WORKFLOW_EXECUTOR_URL` environment variable.
    console.warn(
      'Cloudflare environment context not found. Ensure WORKFLOW_EXECUTOR_URL is set for local development.'
    );
  }

  // This function makes the `env` object available globally so the workflow
  // bindings can access the service binding for the deployed runtime.
  setupGlobalContainerClient(env);

  // Create a URL object to easily parse the pathname for routing.
  const requestUrl = new URL(
    event.node.req.url,
    `http://${event.node.req.headers.host}`
  );

  // A simple API route to trigger a workflow.
  if (requestUrl.pathname === '/start-workflow') {
    try {
      console.log('Attempting to start workflow "exampleWorkflow"...');
      // This `start` call is intercepted by the virtual shim from the bindings plugin.
      // It does NOT execute the workflow here. Instead, it forwards the request
      // to the deployed Cloudflare World runtime for execution.
      //
      // We pass the workflow name as a string. The workflow itself should be defined
      // in a `workflows/` directory at the project root.
      const run = await start('exampleWorkflow', { customerId: 'abc-123' });

      console.log('Workflow started successfully:', run.id);
      return {
        message: 'Workflow "exampleWorkflow" started successfully!',
        runId: run.id,
      };
    } catch (error) {
      console.error('Error starting workflow:', error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      // Return a proper error response
      event.node.res.statusCode = 500;
      event.node.res.setHeader('Content-Type', 'application/json');
      return { error: 'Failed to start workflow', details: errorMessage };
    }
  }

  return {
    message: 'Nitro server with Workflow is running on Cloudflare.',
    usage:
      'Make a POST request to /start-workflow to trigger the "exampleWorkflow".',
  };
});
