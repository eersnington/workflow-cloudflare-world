import type { TemplateDefinition, TemplateFileFactory } from './types.js';

const nextPlaceholders: TemplateFileFactory = {
  'workflows/example.ts': () =>
    `export const WORKFLOW_STUDIO_PLACEHOLDER = '__WORKFLOW_NEXT_MINIMAL__';
`,
};

const nextAiPlaceholders: TemplateFileFactory = {
  'workflows/example.ts': () =>
    `export const WORKFLOW_STUDIO_PLACEHOLDER = '__WORKFLOW_NEXT_AI__';
`,
};

export const nextTemplates: TemplateDefinition = {
  label: 'Next.js',
  description: 'Full-stack template using Next.js App Router.',
  examples: {
    minimal: {
      label: 'Minimal workflow starter',
      description: 'Hello-world workflow wired into a basic Next.js app.',
      placeholders: nextPlaceholders,
      codemods: [
        'next/config/with-workflow',
        'next/typescript/plugin',
        'next/minimal/page',
        'next/minimal/workflow',
      ],
    },
    ai: {
      label: 'AI Orchestrator',
      description:
        'Demonstrates chaining steps together to orchestrate reasoning agents.',
      placeholders: nextAiPlaceholders,
      codemods: [
        'next/config/with-workflow',
        'next/typescript/plugin',
        'next/ai/page',
        'next/ai/workflow',
      ],
    },
  },
};
