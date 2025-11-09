import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://svelte.dev/docs/kit/integrations
  // for more information about preprocessors
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    // WARNING: CSRF protection is disabled for testing/development purposes.
    // This configuration trusts all origins and should NOT be used in production.
    // In production, specify only trusted origins or remove this configuration
    // to use SvelteKit's default CSRF protection.
    csrf: { trustedOrigins: ['*'] },
  },
};

export default config;
