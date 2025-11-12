import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { cloudflareWorkflowTransformer } from 'workflow-cloudflare-bindings/vite-plugin';

export default defineConfig({
  plugins: [cloudflareWorkflowTransformer(), sveltekit()],
});
