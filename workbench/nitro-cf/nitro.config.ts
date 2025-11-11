import { defineNitroConfig } from 'nitropack/config';

// https://nitro.build/config
export default defineNitroConfig({
  compatibilityDate: 'latest',
  srcDir: 'server',
  imports: false,
  modules: ['workflow/nitro'],
  preset: 'cloudflare-module',
  entry: './server/index.ts',
  externals: {
    // These are Node.js modules that are not available in the Cloudflare Workers runtime.
    // We mark them as external to prevent them from being bundled.
    externals: ['@opentelemetry/api', '@vercel/oidc', 'nanoid', 'ulid'],
  },
});
