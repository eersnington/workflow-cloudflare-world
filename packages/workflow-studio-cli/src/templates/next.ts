import type { TemplateDefinition, TemplateFileFactory } from './types.js';

const nextPlaceholders: TemplateFileFactory = {
  'workflows/user-signup.ts': () =>
    `export const WORKFLOW_STUDIO_PLACEHOLDER = '__WORKFLOW_NEXT_MINIMAL__';
`,
};

const nextAiPlaceholders: TemplateFileFactory = {
  'workflows/sequential-workflow.ts': () =>
    `export const WORKFLOW_STUDIO_PLACEHOLDER = '__WORKFLOW_SEQUENTIAL__';
`,
  'workflows/orchestrator-workflow.ts': () =>
    `export const WORKFLOW_STUDIO_PLACEHOLDER = '__WORKFLOW_ORCHESTRATOR__';
`,
};

export const nextTemplates: TemplateDefinition = {
  label: 'Next.js',
  handlebars: 'next',
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
      label: 'AI Workflows',
      description:
        'Demonstrates sequential marketing copy generation and orchestrator feature planning with AI SDK.',
      placeholders: nextAiPlaceholders,
      files: {
        'app/api/workflows/route.ts':
          () => `import { NextResponse } from 'next/server';
import { type Run, start } from 'workflow/api';
import { sequentialWorkflow } from '@/workflows/sequential-workflow';
import { orchestratorWorkflow } from '@/workflows/orchestrator-workflow';

export async function POST(request: Request) {
  const { pattern } = await request.json();
  let run: Run<unknown> | undefined;

  switch (pattern) {
    case 'sequential':
      // Marketing Copy Generation
      run = await start(sequentialWorkflow, [
        'Vercel Workflow DevKit for building durable workflows that survive restarts',
      ]);
      break;
    case 'orchestrator':
      // Feature Planning
      run = await start(orchestratorWorkflow, [
        'Add a dark mode toggle to the Next.js dashboard, persist the preference per user, and ensure the UI updates without a full reload.',
      ]);
      break;
    default:
      return NextResponse.json({ error: 'Invalid pattern' }, { status: 400 });
  }

  const runId = run.runId;
  return NextResponse.json({ runId });
}
`,
      },
      codemods: [
        'next/config/with-workflow',
        'next/typescript/plugin',
        'next/ai/page',
        'next/ai/sequential-workflow',
        'next/ai/orchestrator-workflow',
      ],
    },
  },
};
