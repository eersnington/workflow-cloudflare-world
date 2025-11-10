import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import devtoolsJson from 'vite-plugin-devtools-json';
import { workflowPlugin } from 'workflow/sveltekit';
import { cloudflareWorkflowTransformer } from 'workflow-cloudflare-world/vite-plugin';

export default defineConfig({
  plugins: [
    workflowPlugin(),
    cloudflareWorkflowTransformer(),
    devtoolsJson(),
    sveltekit(),
  ],
});
