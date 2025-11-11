// src/hooks.server.ts
import { setupGlobalContainerClient } from 'workflow-cloudflare-bindings';
import type { Handle } from '@sveltejs/kit';

/**
 * This SvelteKit server hook runs on every request that hits the server.
 * Its purpose is to initialize the workflow bindings by calling `setupGlobalContainerClient`.
 *
 * This function makes the Cloudflare environment variables, including the crucial
 * service binding for the workflow runtime, available to the workflow system
 * in a global context.
 */
export const handle: Handle = async ({ event, resolve }) => {
  // `event.platform.env` is how SvelteKit exposes the Cloudflare environment
  // (including service bindings from wrangler.toml) to your application.
  if (event.platform?.env) {
    setupGlobalContainerClient(event.platform.env);
  } else {
    // This warning is useful for local development (`vite dev`) where `event.platform`
    // may not be defined. In that case, the bindings will fall back to using the
    // `WORKFLOW_EXECUTOR_URL` environment variable.
    console.warn(
      'Cloudflare platform environment not found. Ensure WORKFLOW_EXECUTOR_URL is set for local development.'
    );
  }

  // Continue processing the request as normal.
  const response = await resolve(event);
  return response;
};
