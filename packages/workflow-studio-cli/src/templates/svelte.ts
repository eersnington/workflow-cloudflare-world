import type { TemplateDefinition, TemplateFileFactory } from './types.js';

const svelteMinimalPlaceholders: TemplateFileFactory = {
  'workflows/example.ts': () =>
    `export const WORKFLOW_STUDIO_PLACEHOLDER = '__WORKFLOW_SVELTE_MINIMAL__';
`,
};

const svelteCronPlaceholders: TemplateFileFactory = {
  'workflows/example.ts': () =>
    `export const WORKFLOW_STUDIO_PLACEHOLDER = '__WORKFLOW_SVELTE_CRON__';
`,
};

export const svelteTemplates: TemplateDefinition = {
  label: 'SvelteKit',
  description: 'Progressive web app template powered by SvelteKit.',
  examples: {
    minimal: {
      label: 'Minimal workflow starter',
      description: 'Hello-world workflow with a Svelte route.',
      placeholders: svelteMinimalPlaceholders,
      codemods: [
        'svelte/vite/plugin',
        'svelte/typescript/plugin',
        'svelte/minimal/page',
        'svelte/minimal/workflow',
      ],
    },
    cron: {
      label: 'Cron orchestrator',
      description: 'Cron-style workflow that schedules work periodically.',
      placeholders: svelteCronPlaceholders,
      codemods: [
        'svelte/vite/plugin',
        'svelte/typescript/plugin',
        'svelte/cron/page',
        'svelte/cron/workflow',
      ],
    },
  },
};
