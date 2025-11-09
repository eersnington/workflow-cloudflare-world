import type { Handle } from '@sveltejs/kit';
import type { CloudflareEnv } from 'workflow-cloudflare-world';

let worldInitialized = false;

export const handle: Handle = async ({ event, resolve }) => {
  const env = event.platform?.env as CloudflareEnv | undefined;
  if (env && !worldInitialized) {
    const { createWorld } = await import('workflow-cloudflare-world');
    const { setWorld } = await import('workflow/runtime');
    // Ensure Workflow APIs talk to the Cloudflare world instead of falling back
    // to the embedded filesystem implementation (which tries to use Node's fs).
    setWorld(createWorld(env));
    worldInitialized = true;
  }

  return resolve(event);
};
