import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import devtoolsJson from 'vite-plugin-devtools-json';
import { workflowPlugin } from 'workflow/sveltekit';
import { cloudflareWorkflowTransformer } from 'workflow-cloudflare-world';

export default defineConfig({
  plugins: [
    workflowPlugin(),
    cloudflareWorkflowTransformer(),
    devtoolsJson(),
    sveltekit(),
  ],
  ssr: {
    external: [
      'workflow-cloudflare-world',
      '@workflow/world',
      '@workflow/core',
    ],
  },
  build: {
    rollupOptions: {
      external: [
        'cloudflare:workers',
        'workflow-cloudflare-world',
        '@workflow/world',
      ],
    },
  },
});
