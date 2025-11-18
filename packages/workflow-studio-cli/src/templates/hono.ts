import type { TemplateDefinition, TemplateFileFactory } from './types.js';

const honoPlaceholders: TemplateFileFactory = {
  'workflows/example.ts': () =>
    `export const WORKFLOW_STUDIO_PLACEHOLDER = '__WORKFLOW_HONO_MINIMAL__';
`,
};

const nitroConfig = `import { defineConfig } from 'nitro';

export default defineConfig({
  modules: ['workflow/nitro'],
  routes: {
    '/**': './src/index.ts',
  },
});
`;

const honoFiles: TemplateFileFactory = {
  'nitro.config.ts': () => nitroConfig,
};

export const honoTemplates: TemplateDefinition = {
  label: 'Hono',
  description: 'Fast edge-ready APIs powered by Hono + Nitro.',
  examples: {
    minimal: {
      label: 'Minimal workflow starter',
      description: 'Hello-world workflow triggered from a Hono route.',
      placeholders: honoPlaceholders,
      files: honoFiles,
      codemods: [
        'hono/index/route',
        'hono/workflow',
        'hono/tsconfig/plugin',
        'hono/package/scripts',
      ],
    },
  },
};
