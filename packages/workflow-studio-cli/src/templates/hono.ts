import type { TemplateDefinition, TemplateFileFactory } from './types.js';

const honoPlaceholders: TemplateFileFactory = {
  'workflows/user-signup.ts': () =>
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

const honoAiPlaceholders: TemplateFileFactory = {
  'workflows/sequential-workflow.ts': () =>
    `export const WORKFLOW_STUDIO_PLACEHOLDER = '__WORKFLOW_SEQUENTIAL__';
`,
  'workflows/orchestrator-workflow.ts': () =>
    `export const WORKFLOW_STUDIO_PLACEHOLDER = '__WORKFLOW_ORCHESTRATOR__';
`,
  'src/index.ts': () =>
    `export const WORKFLOW_STUDIO_PLACEHOLDER = '__WORKFLOW_HONO_AI_ROUTE__';
`,
};

export const honoTemplates: TemplateDefinition = {
  label: 'Hono',
  handlebars: 'hono',
  examples: {
    minimal: {
      label: 'Minimal workflow starter',
      description: 'Hello-world workflow triggered from a Hono route.',
      placeholders: honoPlaceholders,
      files: honoFiles,
      codemods: ['hono/index/route', 'hono/workflow'],
    },
    ai: {
      label: 'AI Workflows',
      description:
        'Sequential marketing copy generation and orchestrator feature planning with AI SDK.',
      placeholders: honoAiPlaceholders,
      codemods: [
        'hono/ai/route',
        'hono/ai/sequential-workflow',
        'hono/ai/orchestrator-workflow',
      ],
    },
  },
};
