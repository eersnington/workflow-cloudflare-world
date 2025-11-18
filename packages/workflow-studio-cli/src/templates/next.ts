import type { TemplateDefinition, TemplateFileFactory } from './types.js';

const nextPlaceholders: TemplateFileFactory = {
  'workflows/user-signup.ts': () =>
    `export const WORKFLOW_STUDIO_PLACEHOLDER = '__WORKFLOW_NEXT_MINIMAL__';
`,
};

const nextAiPlaceholders: TemplateFileFactory = {
  'workflows/user-signup.ts': () =>
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
      files: {
        'app/api/signup/route.ts': () => `import { start } from 'workflow/api';
import { handleUserSignup } from '@/workflows/user-signup';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { email } = await request.json();
  await start(handleUserSignup, [email]);
  return NextResponse.json({ message: 'User signup workflow started' });
}
`,
      },
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
