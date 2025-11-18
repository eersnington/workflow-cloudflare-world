import type { CodemodId } from './codemods.js';

export type TemplateContext = {
  projectName: string;
};

type TemplateFileFactory = Record<string, (ctx: TemplateContext) => string>;

export type TemplateExample = {
  label: string;
  description: string;
  files?: TemplateFileFactory;
  placeholders?: TemplateFileFactory;
  codemods?: CodemodId[];
};

export type TemplateDefinition = {
  label: string;
  description: string;
  examples: Record<string, TemplateExample>;
};

export const templates: Record<string, TemplateDefinition> = {
  nextjs: {
    label: 'Next.js',
    description: 'Full-stack template using Next.js App Router.',
    examples: {
      minimal: {
        label: 'Minimal workflow starter',
        description: 'Hello-world workflow wired into a basic Next.js app.',
        placeholders: {
          'workflows/example.ts':
            () => `export const WORKFLOW_STUDIO_PLACEHOLDER = '__WORKFLOW_NEXT_MINIMAL__';
`,
        },
        codemods: ['next/minimal/page', 'next/minimal/workflow'],
      },
      ai: {
        label: 'AI Orchestrator',
        description:
          'Demonstrates chaining steps together to orchestrate reasoning agents.',
        placeholders: {
          'workflows/example.ts':
            () => `export const WORKFLOW_STUDIO_PLACEHOLDER = '__WORKFLOW_NEXT_AI__';
`,
        },
        codemods: ['next/ai/page', 'next/ai/workflow'],
      },
    },
  },
  sveltekit: {
    label: 'SvelteKit',
    description: 'Progressive web app template powered by SvelteKit.',
    examples: {
      minimal: {
        label: 'Minimal workflow starter',
        description: 'Hello-world workflow with a Svelte route.',
        placeholders: {
          'workflows/example.ts':
            () => `export const WORKFLOW_STUDIO_PLACEHOLDER = '__WORKFLOW_SVELTE_MINIMAL__';
`,
        },
        codemods: ['svelte/minimal/page', 'svelte/minimal/workflow'],
      },
      cron: {
        label: 'Cron orchestrator',
        description: 'Cron-style workflow that schedules work periodically.',
        placeholders: {
          'workflows/example.ts':
            () => `export const WORKFLOW_STUDIO_PLACEHOLDER = '__WORKFLOW_SVELTE_CRON__';
`,
        },
        codemods: ['svelte/cron/page', 'svelte/cron/workflow'],
      },
    },
  },
};

export type TemplateName = keyof typeof templates;
