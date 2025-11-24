import type { TemplateDefinition, TemplateFileFactory } from './types.js';

const nuxtFiles: TemplateFileFactory = {
  'server/workflows/user-signup.ts': () => `import { sleep } from 'workflow';
import { FatalError } from 'workflow';

export async function handleUserSignup(email: string) {
  "use workflow";

  const user = await createUser(email);
  await sendWelcomeEmail(user);

  await sleep('5s');
  await sendOnboardingEmail(user);

  console.log("Workflow is complete! Run 'npx workflow web' to inspect your run");

  return { userId: user.id, status: 'onboarded' };
}

async function createUser(email: string) {
  "use step";

  console.log('Creating user with email: ' + email);

  return { id: crypto.randomUUID(), email };
}

async function sendWelcomeEmail(user: { id: string; email: string }) {
  "use step";

  console.log('Sending welcome email to user: ' + user.id);

  if (Math.random() < 0.3) {
    throw new Error('Retryable!');
  }
}

async function sendOnboardingEmail(user: { id: string; email: string }) {
  "use step";

  if (!user.email.includes('@')) {
    throw new FatalError('Invalid Email');
  }

  console.log('Sending onboarding email to user: ' + user.id);
}
`,
  'server/api/signup.post.ts': () => `import { start } from "workflow/api";
import { defineEventHandler, readBody } from "h3";
import { handleUserSignup } from "../workflows/user-signup";

export default defineEventHandler(async (event) => {
  const { email } = await readBody(event);

  await start(handleUserSignup, [email]);

  return {
    message: "User signup workflow started",
  };
});
`,
};

const nuxtAiPlaceholders: TemplateFileFactory = {
  'server/workflows/sequential-workflow.ts': () =>
    `export const WORKFLOW_STUDIO_PLACEHOLDER = '__WORKFLOW_SEQUENTIAL__';
`,
  'server/workflows/orchestrator-workflow.ts': () =>
    `export const WORKFLOW_STUDIO_PLACEHOLDER = '__WORKFLOW_ORCHESTRATOR__';
`,
  'server/api/workflows.post.ts': () =>
    `export const WORKFLOW_STUDIO_PLACEHOLDER = '__WORKFLOW_NUXT_AI_ROUTE__';
`,
  'app/app.vue': () => `<!-- __WORKFLOW_NUXT_AI_PAGE__ -->\n`,
};

export const nuxtTemplates: TemplateDefinition = {
  label: 'Nuxt',
  handlebars: 'nuxt',
  examples: {
    minimal: {
      label: 'Minimal workflow starter',
      description: 'Hello-world workflow triggered from a Nuxt API route.',
      files: nuxtFiles,
    },
    ai: {
      label: 'AI Workflows',
      description:
        'Sequential marketing copy generation and orchestrator feature planning with AI SDK.',
      placeholders: nuxtAiPlaceholders,
      codemods: [
        'nuxt/ai/page',
        'nuxt/ai/route',
        'nuxt/ai/sequential-workflow',
        'nuxt/ai/orchestrator-workflow',
      ],
    },
  },
};
