import type { TemplateDefinition, TemplateFileFactory } from './types.js';

const svelteMinimalPlaceholders: TemplateFileFactory = {
  'workflows/user-signup.ts': () =>
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
  handlebars: 'svelte',
  examples: {
    minimal: {
      label: 'Minimal workflow starter',
      description: 'Hello-world workflow with a Svelte route.',
      placeholders: svelteMinimalPlaceholders,
      files: {
        'src/routes/api/signup/+server.ts':
          () => `import { start } from 'workflow/api';
import { handleUserSignup } from '../../../../workflows/user-signup';
import { json, type RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({
  request,
}: {
  request: Request;
}) => {
  const { email } = await request.json();

  await start(handleUserSignup, [email]);

  return json({ message: 'User signup workflow started' });
};
`,
      },
      codemods: ['svelte/minimal/page', 'svelte/minimal/workflow'],
    },
    cron: {
      label: 'Cron orchestrator',
      description: 'Cron-style workflow that schedules work periodically.',
      placeholders: svelteCronPlaceholders,
      codemods: ['svelte/cron/page', 'svelte/cron/workflow'],
    },
  },
};
