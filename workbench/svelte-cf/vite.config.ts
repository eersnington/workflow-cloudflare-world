import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { workflowPlugin } from 'workflow/sveltekit';
import { cloudflareWorkflowTransformer } from 'workflow-cloudflare-bindings/src/vite-plugin';

export default defineConfig({
  ssr: {
    noExternal: ['workflow'],
  },
  plugins: [
    workflowPlugin(), // compile "use workflow"/"use step"
    cloudflareWorkflowTransformer(), // forward execution to the runtime which is your deployed cloudflare world
    sveltekit(),
  ],
});
