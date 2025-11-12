import type { Handle } from '@sveltejs/kit';
import { setupGlobalContainerClient } from 'workflow-cloudflare-bindings';

export const handle: Handle = async ({ event, resolve }) => {
  // `platform` is defined when running on Cloudflare Workers
  if (event.platform) {
    setupGlobalContainerClient(event.platform.env);
  }

  return resolve(event);
};
