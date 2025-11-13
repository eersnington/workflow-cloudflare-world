import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { workflowPlugin } from 'workflow/sveltekit';
import { cloudflareWorkflowTransformer } from 'workflow-cloudflare-bindings/vite-plugin';

export default defineConfig({
  ssr: {
    noExternal: [
      'workflow',
      'workflow/runtime',
      'workflow/api',
      'workflow-cloudflare-bindings',
    ],
  },

  optimizeDeps: {
    exclude: [
      'workflow',
      'workflow/runtime',
      'workflow/api',
      'workflow-cloudflare-bindings',
    ],
  },
  plugins: [
    workflowPlugin(), // compile "use workflow"/"use step"
    cloudflareWorkflowTransformer(), // forward execution to cloudflare world which is deployed on your cloudflare containers
    sveltekit(),
  ],
});
